using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Moonbase.Web
{
    /// <summary>
    /// The tiny local host: an <see cref="HttpListener"/> (wildcard-bound for macOS
    /// HttpListener reasons, loopback-enforced per request) that serves the
    /// single-page client at <c>/</c> and upgrades <c>/ws</c> to a WebSocket. No web
    /// framework, no packages. All game logic lives in <see cref="GameSession"/>; this class
    /// only moves bytes — it broadcasts the session's JSON payloads to every open socket and
    /// forwards each received message to the session's command queue.
    ///
    /// One send loop per connection (only it calls SendAsync, so no concurrent-write hazard);
    /// one receive loop per connection. A new connection is caught up from GameSession.Snapshot
    /// so its canvas paints a full frame the instant it connects.
    /// </summary>
    public sealed class WebHost
    {
        private readonly int _port;
        private readonly HttpListener _listener = new HttpListener();
        private readonly string _clientHtmlPath;
        private GameSession _session;

        private readonly object _connLock = new object();
        private readonly List<Connection> _conns = new List<Connection>();

        public WebHost(int port)
        {
            _port = port;
            // Wildcard host: the managed (non-Windows) HttpListener does its own Host-header
            // prefix matching and quietly 404s named-host prefixes like "localhost"; "+" matches
            // any host on the port, so both localhost and 127.0.0.1 requests are handed to us.
            _listener.Prefixes.Add($"http://+:{port}/");
            _clientHtmlPath = ResolveClientHtml();
        }

        public string ClientHtmlPath => _clientHtmlPath;

        public void Run(GameSession session)
        {
            _session = session;
            _listener.Start();
            _ = AcceptLoop();
        }

        public void Stop()
        {
            try { _listener.Stop(); } catch { /* best effort */ }
            lock (_connLock)
            {
                foreach (var c in _conns) c.Alive = false;
                _conns.Clear();
            }
        }

        /// <summary>Fan a payload out to every connected client (called from the sim thread).</summary>
        public void Broadcast(string json)
        {
            lock (_connLock)
            {
                for (int i = 0; i < _conns.Count; i++)
                {
                    _conns[i].Out.Enqueue(json);
                    try { _conns[i].Signal.Release(); } catch { /* disposed */ }
                }
            }
        }

        private async Task AcceptLoop()
        {
            while (_listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync().ConfigureAwait(false); }
                catch { break; } // listener stopped

                // The "+" prefix binds every interface (named localhost prefixes 404 on
                // macOS), so enforce loopback-only here: this is a local dev tool with an
                // unauthenticated command channel — never serve the LAN.
                if (!ctx.Request.IsLocal)
                {
                    try { ctx.Response.StatusCode = 403; ctx.Response.OutputStream.Close(); } catch { }
                    continue;
                }

                if (ctx.Request.IsWebSocketRequest && ctx.Request.Url.AbsolutePath == "/ws")
                    _ = HandleWebSocket(ctx);
                else
                    HandleHttp(ctx);
            }
        }

        // ------------------------------------------------------------------- HTTP

        private void HandleHttp(HttpListenerContext ctx)
        {
            try
            {
                string path = ctx.Request.Url.AbsolutePath;
                if (path == "/" || path == "/index.html")
                {
                    byte[] body = ReadClientHtml();
                    ctx.Response.ContentType = "text/html; charset=utf-8";
                    // Never cache: the page is read fresh from source on every request, so a
                    // browser reload must always show the latest Client.html (otherwise edits
                    // "don't show up" behind a heuristically-cached copy).
                    ctx.Response.Headers["Cache-Control"] = "no-store, must-revalidate";
                    ctx.Response.Headers["Pragma"] = "no-cache";
                    // Local-only, self-contained page: lock it down but allow inline (everything
                    // is inline) and the same-origin WebSocket.
                    ctx.Response.Headers["Content-Security-Policy"] =
                        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
                        "img-src data:; connect-src ws://localhost:" + _port + " ws://127.0.0.1:" + _port + "; base-uri 'none'";
                    ctx.Response.OutputStream.Write(body, 0, body.Length);
                }
                else
                {
                    ctx.Response.StatusCode = 404;
                }
            }
            catch { /* client hung up */ }
            finally { try { ctx.Response.OutputStream.Close(); } catch { } }
        }

        private byte[] ReadClientHtml()
        {
            try { return File.ReadAllBytes(_clientHtmlPath); }
            catch
            {
                return Encoding.UTF8.GetBytes(
                    "<!doctype html><meta charset=utf-8><title>PeriluneWeb</title>" +
                    "<p>Client.html not found next to the binary or in hosts/web/.</p>");
            }
        }

        // ------------------------------------------------------------------- WebSocket

        private async Task HandleWebSocket(HttpListenerContext ctx)
        {
            WebSocketContext wsCtx;
            try { wsCtx = await ctx.AcceptWebSocketAsync(null).ConfigureAwait(false); }
            catch { ctx.Response.StatusCode = 500; try { ctx.Response.Close(); } catch { } return; }

            var conn = new Connection(wsCtx.WebSocket);
            lock (_connLock) _conns.Add(conn);

            // Catch the new tab up with the latest full frame + sidebar.
            foreach (var payload in _session.Snapshot())
                conn.Out.Enqueue(payload);
            try { conn.Signal.Release(); } catch { }

            var send = SendLoop(conn);
            await ReceiveLoop(conn).ConfigureAwait(false);
            conn.Alive = false;
            try { conn.Signal.Release(); } catch { }
            await send.ConfigureAwait(false);

            lock (_connLock) _conns.Remove(conn);
            try { conn.Ws.Dispose(); } catch { }
        }

        private static async Task SendLoop(Connection conn)
        {
            var enc = Encoding.UTF8;
            try
            {
                while (conn.Alive && conn.Ws.State == WebSocketState.Open)
                {
                    await conn.Signal.WaitAsync().ConfigureAwait(false);
                    while (conn.Out.TryDequeue(out var msg))
                    {
                        byte[] bytes = enc.GetBytes(msg);
                        await conn.Ws.SendAsync(new ArraySegment<byte>(bytes),
                            WebSocketMessageType.Text, true, CancellationToken.None).ConfigureAwait(false);
                    }
                }
            }
            catch { /* socket died mid-send */ }
        }

        private async Task ReceiveLoop(Connection conn)
        {
            var buffer = new byte[8192];
            var sb = new StringBuilder();
            try
            {
                while (conn.Ws.State == WebSocketState.Open)
                {
                    WebSocketReceiveResult r;
                    try { r = await conn.Ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None).ConfigureAwait(false); }
                    catch { break; }

                    if (r.MessageType == WebSocketMessageType.Close)
                    {
                        try { await conn.Ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None).ConfigureAwait(false); } catch { }
                        break;
                    }

                    sb.Append(Encoding.UTF8.GetString(buffer, 0, r.Count));
                    // Commands are tiny one-object messages; cap accumulation so a hostile
                    // or broken client can't grow the buffer without bound.
                    if (sb.Length > 64 * 1024)
                    {
                        try { await conn.Ws.CloseAsync(WebSocketCloseStatus.MessageTooBig, "too big", CancellationToken.None).ConfigureAwait(false); } catch { }
                        break;
                    }
                    if (!r.EndOfMessage) continue;

                    string text = sb.ToString();
                    sb.Clear();
                    var cmd = WebCommand.Parse(text);
                    if (cmd.Kind != CmdKind.Unknown) _session.Enqueue(cmd);
                }
            }
            catch { /* client vanished */ }
        }

        // ------------------------------------------------------------------- resolve

        /// <summary>Prefer the editable source file (hosts/web/Client.html found by
        /// walking up from the binary) so a page edit shows on refresh without a rebuild;
        /// otherwise the copy the build dropped next to the binary.</summary>
        private static string ResolveClientHtml()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "hosts", "web", "Client.html");
                if (File.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return Path.Combine(AppContext.BaseDirectory, "Client.html");
        }

        private sealed class Connection
        {
            public readonly WebSocket Ws;
            public readonly System.Collections.Concurrent.ConcurrentQueue<string> Out
                = new System.Collections.Concurrent.ConcurrentQueue<string>();
            public readonly SemaphoreSlim Signal = new SemaphoreSlim(0);
            public volatile bool Alive = true;
            public Connection(WebSocket ws) { Ws = ws; }
        }
    }
}
