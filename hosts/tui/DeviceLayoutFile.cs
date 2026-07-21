using System.Collections.Generic;
using System.Globalization;
using Moonbase.Gen;
using Moonbase.Sim;

namespace Moonbase.Tui
{
    /// <summary>
    /// Hand-rolled reader for Resources/DeviceLayout.json — the Sim.Core assemblies
    /// carry no JSON library (Unity parses this with UnityEngine.JsonUtility, which
    /// the headless host cannot reference), so the terminal skin re-implements the
    /// exact schema Game.View/DeviceLayoutJson reads:
    ///
    ///   { "entries": [ { "name": str, "x": int, "y": int, "z": int,
    ///                    "remove": bool, "hasYaw": bool, "yaw": number } ] }
    ///
    /// The contract mirrors <see cref="DeviceLayout.Apply"/>: never throw on bad
    /// input — a stale hand edit or a truncated file must not brick the boot. Every
    /// structural problem becomes a human-readable line in <c>problems</c> and the
    /// offending entry is skipped; well-formed entries around it still load. Missing
    /// scalar fields default the way JsonUtility would (0 / false / null), so the
    /// real repo file parses with zero problems.
    /// </summary>
    public static class DeviceLayoutFile
    {
        /// <summary>Parse the JSON text into layout entries. Returns the entries that
        /// parsed cleanly; <paramref name="problems"/> collects every skipped entry
        /// or malformed-input note. Never throws.</summary>
        public static List<DeviceLayout.Entry> Parse(string json, out List<string> problems)
        {
            problems = new List<string>();
            var entries = new List<DeviceLayout.Entry>();
            if (string.IsNullOrEmpty(json))
            {
                problems.Add("layout: empty file");
                return entries;
            }

            JsonValue root;
            try
            {
                root = JsonParser.Parse(json);
            }
            catch (JsonError e)
            {
                problems.Add($"layout: malformed JSON ({e.Message})");
                return entries;
            }

            if (root.Kind != JsonKind.Object)
            {
                problems.Add("layout: root is not an object");
                return entries;
            }
            if (!root.TryGet("entries", out var entriesVal))
            {
                // Mirror JsonUtility: a missing "entries" is simply no overrides.
                return entries;
            }
            if (entriesVal.Kind != JsonKind.Array)
            {
                problems.Add("layout: 'entries' is not an array");
                return entries;
            }

            var arr = entriesVal.Array;
            for (int i = 0; i < arr.Count; i++)
            {
                var el = arr[i];
                if (el.Kind != JsonKind.Object)
                {
                    problems.Add($"layout entry {i}: not an object");
                    continue;
                }

                if (!TryString(el, "name", i, problems, out string name) || string.IsNullOrEmpty(name))
                {
                    problems.Add($"layout entry {i}: missing or empty 'name'");
                    continue;
                }
                if (!TryInt(el, "x", i, name, problems, out int x)) continue;
                if (!TryInt(el, "y", i, name, problems, out int y)) continue;
                if (!TryInt(el, "z", i, name, problems, out int z)) continue;
                if (!TryBool(el, "remove", i, name, problems, out bool remove)) continue;
                if (!TryBool(el, "hasYaw", i, name, problems, out bool hasYaw)) continue;
                if (!TryNumber(el, "yaw", i, name, problems, out double yaw)) continue;

                entries.Add(new DeviceLayout.Entry
                {
                    Name = name,
                    Pos = new Int3(x, y, z),
                    Remove = remove,
                    HasYaw = hasYaw,
                    YawDeg = (float)yaw,
                });
            }
            return entries;
        }

        // Field readers: absent field ⇒ JsonUtility default; present-but-wrong-type
        // ⇒ a problem and the whole entry is skipped (return false).

        private static bool TryString(JsonValue obj, string key, int idx, List<string> problems, out string value)
        {
            value = null;
            if (!obj.TryGet(key, out var v)) return true; // absent ⇒ null default
            if (v.Kind == JsonKind.Null) return true;
            if (v.Kind != JsonKind.String)
            {
                problems.Add($"layout entry {idx}: '{key}' is not a string");
                return false;
            }
            value = v.String;
            return true;
        }

        private static bool TryInt(JsonValue obj, string key, int idx, string name, List<string> problems, out int value)
        {
            value = 0;
            if (!obj.TryGet(key, out var v) || v.Kind == JsonKind.Null) return true; // absent ⇒ 0
            if (v.Kind != JsonKind.Number)
            {
                problems.Add($"'{name}': '{key}' is not a number");
                return false;
            }
            value = (int)v.Number;
            return true;
        }

        private static bool TryNumber(JsonValue obj, string key, int idx, string name, List<string> problems, out double value)
        {
            value = 0.0;
            if (!obj.TryGet(key, out var v) || v.Kind == JsonKind.Null) return true; // absent ⇒ 0
            if (v.Kind != JsonKind.Number)
            {
                problems.Add($"'{name}': '{key}' is not a number");
                return false;
            }
            value = v.Number;
            return true;
        }

        private static bool TryBool(JsonValue obj, string key, int idx, string name, List<string> problems, out bool value)
        {
            value = false;
            if (!obj.TryGet(key, out var v) || v.Kind == JsonKind.Null) return true; // absent ⇒ false
            if (v.Kind != JsonKind.Bool)
            {
                problems.Add($"'{name}': '{key}' is not a bool");
                return false;
            }
            value = v.Bool;
            return true;
        }
    }

    // -------------------------------------------------------------- tiny JSON reader

    internal enum JsonKind { Null, Bool, Number, String, Array, Object }

    /// <summary>A parsed JSON node. Deliberately tiny — only the shapes DeviceLayout
    /// needs, but a complete recursive value model so unexpected shapes read cleanly
    /// (and are rejected with a problem rather than a crash).</summary>
    internal sealed class JsonValue
    {
        public JsonKind Kind;
        public bool Bool;
        public double Number;
        public string String;
        public List<JsonValue> Array;
        public Dictionary<string, JsonValue> Object;

        public bool TryGet(string key, out JsonValue value)
        {
            value = null;
            return Object != null && Object.TryGetValue(key, out value);
        }
    }

    internal sealed class JsonError : System.Exception
    {
        public JsonError(string message) : base(message) { }
    }

    /// <summary>Minimal, allocation-tolerant recursive-descent JSON parser. Supports
    /// objects, arrays, strings (with the standard escapes), numbers (InvariantCulture),
    /// true/false/null. Throws <see cref="JsonError"/> on any malformation — callers
    /// convert that into a fail-soft problem line.</summary>
    internal static class JsonParser
    {
        public static JsonValue Parse(string s)
        {
            int i = 0;
            SkipWs(s, ref i);
            var v = ParseValue(s, ref i);
            SkipWs(s, ref i);
            if (i != s.Length) throw new JsonError($"trailing content at {i}");
            return v;
        }

        private static JsonValue ParseValue(string s, ref int i)
        {
            if (i >= s.Length) throw new JsonError("unexpected end of input");
            char c = s[i];
            switch (c)
            {
                case '{': return ParseObject(s, ref i);
                case '[': return ParseArray(s, ref i);
                case '"': return new JsonValue { Kind = JsonKind.String, String = ParseString(s, ref i) };
                case 't': Literal(s, ref i, "true"); return new JsonValue { Kind = JsonKind.Bool, Bool = true };
                case 'f': Literal(s, ref i, "false"); return new JsonValue { Kind = JsonKind.Bool, Bool = false };
                case 'n': Literal(s, ref i, "null"); return new JsonValue { Kind = JsonKind.Null };
                default: return ParseNumber(s, ref i);
            }
        }

        private static JsonValue ParseObject(string s, ref int i)
        {
            var obj = new Dictionary<string, JsonValue>();
            i++; // '{'
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return new JsonValue { Kind = JsonKind.Object, Object = obj }; }
            while (true)
            {
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new JsonError($"expected object key at {i}");
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new JsonError($"expected ':' at {i}");
                i++;
                SkipWs(s, ref i);
                obj[key] = ParseValue(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length) throw new JsonError("unterminated object");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; break; }
                throw new JsonError($"expected ',' or '}}' at {i}");
            }
            return new JsonValue { Kind = JsonKind.Object, Object = obj };
        }

        private static JsonValue ParseArray(string s, ref int i)
        {
            var arr = new List<JsonValue>();
            i++; // '['
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return new JsonValue { Kind = JsonKind.Array, Array = arr }; }
            while (true)
            {
                SkipWs(s, ref i);
                arr.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i >= s.Length) throw new JsonError("unterminated array");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; break; }
                throw new JsonError($"expected ',' or ']' at {i}");
            }
            return new JsonValue { Kind = JsonKind.Array, Array = arr };
        }

        private static string ParseString(string s, ref int i)
        {
            i++; // opening quote
            var sb = new System.Text.StringBuilder();
            while (true)
            {
                if (i >= s.Length) throw new JsonError("unterminated string");
                char c = s[i++];
                if (c == '"') break;
                if (c == '\\')
                {
                    if (i >= s.Length) throw new JsonError("unterminated escape");
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length ||
                                !int.TryParse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int code))
                                throw new JsonError("bad \\u escape");
                            sb.Append((char)code);
                            i += 4;
                            break;
                        default: throw new JsonError($"bad escape '\\{e}'");
                    }
                }
                else sb.Append(c);
            }
            return sb.ToString();
        }

        private static JsonValue ParseNumber(string s, ref int i)
        {
            int start = i;
            if (i < s.Length && (s[i] == '-' || s[i] == '+')) i++;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++;
            string tok = s.Substring(start, i - start);
            if (tok.Length == 0 || !double.TryParse(tok, NumberStyles.Float, CultureInfo.InvariantCulture, out double val))
                throw new JsonError($"bad number '{tok}' at {start}");
            return new JsonValue { Kind = JsonKind.Number, Number = val };
        }

        private static void Literal(string s, ref int i, string word)
        {
            if (i + word.Length > s.Length || s.Substring(i, word.Length) != word)
                throw new JsonError($"expected '{word}' at {i}");
            i += word.Length;
        }

        private static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
        }
    }
}
