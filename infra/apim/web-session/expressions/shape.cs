var result = new JObject { ["status"] = 502, ["body"] = "{\"error\":\"AUTHENTICATION_UNAVAILABLE\"}", ["cookie"] = "" };
try {
    var cfg = JObject.Parse(configuration);
    var attributes = "; Path=/; Secure; HttpOnly; SameSite=" + (string)cfg["cookie"]["sameSite"];
    var expired = cookieName + "=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT" + attributes;
    var expected = operation == "start" ? 202 : operation == "logout" ? 204 : 200;
    if (status != expected) {
        var statuses = new [] { 401, 403, 409, 422, 429, 500, 502, 503, 504 };
        result["status"] = statuses.Contains(status) ? status : 502;
        if (operation == "refresh" && status == 401) result["cookie"] = expired;
        return result.ToString(Newtonsoft.Json.Formatting.None);
    }
    if (operation == "logout") {
        result["status"] = 204; result["body"] = ""; result["cookie"] = expired;
        return result.ToString(Newtonsoft.Json.Formatting.None);
    }
    if (body.Length > 20000) return result.ToString(Newtonsoft.Json.Formatting.None);
    var raw = JObject.Parse(body);
    var fields = operation == "start" ? new [] { "challenge_reference" } : operation == "verify" ? new [] { "access_token", "token_type", "expires_in", "user_id", "refresh_token" } : new [] { "access_token", "token_type", "expires_in", "user_id" };
    if (raw.Count != fields.Length || raw.Properties().Any(x => !fields.Contains(x.Name))) return result.ToString(Newtonsoft.Json.Formatting.None);
    Guid parsed;
    if (operation == "start") {
        if (raw["challenge_reference"].Type != JTokenType.String || !Guid.TryParseExact((string)raw["challenge_reference"], "D", out parsed)) return result.ToString(Newtonsoft.Json.Formatting.None);
    } else {
        if (raw["access_token"].Type != JTokenType.String || !Regex.IsMatch((string)raw["access_token"], @"\A[A-Za-z0-9._-]{1,16000}\z") || (string)raw["token_type"] != "bearer" || raw["expires_in"].Type != JTokenType.Integer || (long)raw["expires_in"] < 1 || (long)raw["expires_in"] > 2147483647 || raw["user_id"].Type != JTokenType.String || !Guid.TryParseExact((string)raw["user_id"], "D", out parsed)) return result.ToString(Newtonsoft.Json.Formatting.None);
    }
    if (operation == "verify") {
        if (raw["refresh_token"].Type != JTokenType.String || !Regex.IsMatch((string)raw["refresh_token"], @"\A[A-Za-z0-9_-]{43,512}\z")) return result.ToString(Newtonsoft.Json.Formatting.None);
        if (elapsedSeconds < 0) return result.ToString(Newtonsoft.Json.Formatting.None);
        var age = Math.Max(0, (int)cfg["cookie"]["maxAgeSeconds"] - elapsedSeconds);
        if (age == 0) return result.ToString(Newtonsoft.Json.Formatting.None);
        result["cookie"] = cookieName + "=" + (string)raw["refresh_token"] + "; Max-Age=" + age + "; Expires=" + DateTime.UtcNow.AddSeconds(age).ToString("R") + attributes;
        raw.Remove("refresh_token");
    }
    result["status"] = expected; result["body"] = raw.ToString(Newtonsoft.Json.Formatting.None);
    return result.ToString(Newtonsoft.Json.Formatting.None);
} catch { return result.ToString(Newtonsoft.Json.Formatting.None); }
