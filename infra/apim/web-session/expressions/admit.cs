var denied = new JObject { ["status"] = 403, ["body"] = "{\"error\":\"WEB_SESSION_DENIED\"}", ["origin"] = "", ["cookieName"] = "" };
try {
    var cfg = JObject.Parse(configuration);
    if ((bool?)cfg["approved"] != true || (string)cfg["environment"] != "nonprod" || String.IsNullOrWhiteSpace((string)cfg["approvalReference"]) || (bool?)cfg["diagnosticsReviewed"] != true || (bool?)cfg["effectivePolicyReviewed"] != true) return denied.ToString(Newtonsoft.Json.Formatting.None);
    string cookieName = null;
    foreach (var product in ((JObject)cfg["products"]).Properties()) {
        if ((string)product.Value["origin"] == origin) cookieName = (string)product.Value["cookieName"];
    }
    if (String.IsNullOrEmpty(cookieName) || origin == "null") return denied.ToString(Newtonsoft.Json.Formatting.None);
    denied["origin"] = origin;
    denied["cookieName"] = cookieName;
    string operation = null;
    foreach (var route in ((JObject)cfg["routes"]).Properties()) if ((string)route.Value == path) operation = route.Name;
    if (operation == null) return denied.ToString(Newtonsoft.Json.Formatting.None);
    if (method == "OPTIONS") {
        if (requestedMethod != "POST") return denied.ToString(Newtonsoft.Json.Formatting.None);
        var allowed = new [] { "content-type", ((string)cfg["csrf"]["header"]).ToLowerInvariant() };
        var headers = requestedHeaders.Split(',').Select(x => x.Trim().ToLowerInvariant()).ToArray();
        if (headers.Length != 2 || headers.Distinct().Count() != 2 || headers.Any(x => !allowed.Contains(x))) return denied.ToString(Newtonsoft.Json.Formatting.None);
        denied["status"] = 204; denied["body"] = "";
        return denied.ToString(Newtonsoft.Json.Formatting.None);
    }
    if (method != "POST" || csrf != (string)cfg["csrf"]["value"]) return denied.ToString(Newtonsoft.Json.Formatting.None);
    if (requestBody.Length > 16384 || cookieHeader.Length > 8192) { denied["status"] = 413; return denied.ToString(Newtonsoft.Json.Formatting.None); }
    if (Regex.IsMatch(cookieHeader, @"[\r\n]")) { denied["status"] = 400; return denied.ToString(Newtonsoft.Json.Formatting.None); }
    var body = JObject.Parse(requestBody);
    string upstreamBody;
    if (operation == "start" || operation == "verify") {
        var expected = operation == "start" ? new [] { "client_request_id", "phone" } : new [] { "client_login_id", "challenge_reference", "code" };
        if (body.Count != expected.Length || body.Properties().Any(x => !expected.Contains(x.Name)) || body.Properties().Any(x => x.Value.Type != JTokenType.String)) { denied["status"] = 422; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        Guid parsed;
        if (!Guid.TryParseExact((string)body[expected[0]], "D", out parsed)) { denied["status"] = 422; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        if (operation == "start" && !Regex.IsMatch((string)body["phone"], @"\A\+[1-9][0-9]{7,14}\z")) { denied["status"] = 422; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        if (operation == "verify" && (!Guid.TryParseExact((string)body["challenge_reference"], "D", out parsed) || ((string)body["code"]).Length < 1 || ((string)body["code"]).Length > 128)) { denied["status"] = 422; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        upstreamBody = body.ToString(Newtonsoft.Json.Formatting.None);
    } else {
        if (body.Count != 0) { denied["status"] = 422; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        var cookies = cookieHeader.Split(';').Select(x => x.Trim()).Where(x => x.StartsWith(cookieName + "=", StringComparison.Ordinal)).ToArray();
        if (cookies.Length == 0) {
            denied["status"] = operation == "logout" ? 204 : 401; denied["body"] = operation == "logout" ? "" : "{\"error\":\"AUTHENTICATION_REQUIRED\"}";
            denied["clear"] = true;
            return denied.ToString(Newtonsoft.Json.Formatting.None);
        }
        if (cookies.Length != 1) { denied["status"] = 400; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        var credential = cookies[0].Substring(cookieName.Length + 1);
        if (!Regex.IsMatch(credential, @"\A[A-Za-z0-9_-]{43,512}\z")) { denied["status"] = 400; return denied.ToString(Newtonsoft.Json.Formatting.None); }
        upstreamBody = new JObject { ["refresh_token"] = credential }.ToString(Newtonsoft.Json.Formatting.None);
    }
    return new JObject { ["status"] = 0, ["origin"] = origin, ["cookieName"] = cookieName, ["operation"] = operation, ["requestBody"] = upstreamBody, ["backendPath"] = operation == "start" ? "/v1/auth/otp/start" : operation == "verify" ? "/v1/auth/otp/verify" : operation == "refresh" ? "/v1/auth/refresh" : "/v1/auth/logout" }.ToString(Newtonsoft.Json.Formatting.None);
} catch { denied["status"] = 422; return denied.ToString(Newtonsoft.Json.Formatting.None); }
