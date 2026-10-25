"""Static artifact checks only; this does not run an APIM gateway."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

base = Path(__file__).parent
root = ET.parse(base / "policy.xml").getroot()
assert [node.tag for node in root] == ["inbound", "backend", "outbound", "on-error"]
variables = {node.attrib["name"]: node.attrib["value"] for node in root.findall(".//set-variable")}
for name in ["admit", "shape"]:
    source = (base / "expressions" / f"{name}.cs").read_text().strip()
    assert source in variables["admission" if name == "admit" else "shaped"]
assert root.find("backend/forward-request").attrib["follow-redirects"] == "false"
assert root.find("backend/forward-request").attrib["timeout"] == "10"
assert root.find("inbound/rewrite-uri").attrib["copy-unmatched-params"] == "false"
assert "OriginalUrl.Query.Count == 0" in variables["admission"]
assert not any(node.tag in {"base", "retry", "trace", "log-to-eventhub", "cache-store", "cache-lookup"} for node in root.iter())
for returned in root.findall(".//return-response"):
    headers = {node.attrib["name"]: node.findtext("value") for node in returned.findall("set-header")}
    assert headers["Cache-Control"] == "private, no-store, max-age=0"
    assert headers["Vary"] == "Origin"
    assert "Location" not in headers and "Authorization" not in headers
    if "Access-Control-Allow-Origin" in headers:
        assert headers["Access-Control-Allow-Origin"] != "*"
        assert headers["Access-Control-Allow-Credentials"] == "true"
    assert "context.Response.Body" not in returned.findtext("set-body")
assert json.loads((base / "configuration.unapproved.json").read_text())["approved"] is False
guard = ET.parse(base / "raw-auth-browser-guard.xml").getroot()
assert guard.find("inbound/base") is not None
assert 'Headers.ContainsKey("Origin")' in guard.find("inbound/choose/when").attrib["condition"]
print("PASS: XML well-formedness, exact expression embedding, bounded forwarding, query rejection, response construction, redaction and disabled configuration; NOT APIM acceptance.")
