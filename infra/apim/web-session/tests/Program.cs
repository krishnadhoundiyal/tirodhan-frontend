using System;
using System.Linq;
using Newtonsoft.Json.Linq;

public class Program {
  static int checks;
  static void Check(bool condition, string label) { if (!condition) throw new Exception("Policy assertion failed: " + label); checks++; }
  static readonly string Refresh = new string('A',43);
  static readonly string Owner = "00000000-0000-4000-8000-000000000099";
  static readonly string Ops = "https://operations.local-test.invalid";
  static readonly string Customer = "https://customer.local-test.invalid";
  static JObject Configuration() => JObject.Parse(@"{
    'approved':true,'approvalReference':'LOCAL TEST ONLY - NOT ENVIRONMENT APPROVAL', 'environment':'nonprod',
    'diagnosticsReviewed':true,'effectivePolicyReviewed':true,
    'gatewayOrigin':'https://gateway.local-test.invalid','backendOrigin':'https://backend.local-test.invalid',
    'products':{'operations':{'origin':'https://operations.local-test.invalid','cookieName':'__Host-test-ops'},'customer':{'origin':'https://customer.local-test.invalid','cookieName':'__Host-test-customer'}},
    'routes':{'start':'/test-session/start','verify':'/test-session/verify','refresh':'/test-session/refresh','logout':'/test-session/logout'},
    'csrf':{'header':'X-Local-Test-Session','value':'test'},'cookie':{'sameSite':'Strict','sameSiteJustification':'Local test only','maxAgeSeconds':600},'backendRefreshTtlSeconds':600
  }");
  static JObject Admit(string path="/test-session/refresh",string body="{}",string origin=null,string csrf="test",string cookie=null,string method="POST",string requestedMethod="",string requestedHeaders="",JObject config=null) => JObject.Parse(PolicyFunctions.Admit((config??Configuration()).ToString(),origin??Ops,csrf,method,path,requestedMethod,requestedHeaders,body,cookie??("__Host-test-ops="+Refresh)));
  static JObject Shape(string operation,int status,string body,int elapsed=1,string cookie="__Host-test-ops") => JObject.Parse(PolicyFunctions.Shape(Configuration().ToString(),operation,status,body,cookie,elapsed));
  static JObject Grant(bool verify=true) {
    var grant = new JObject { ["access_token"]="synthetic.access.token",["token_type"]="bearer",["expires_in"]=60,["user_id"]=Owner };
    if (verify) grant["refresh_token"]=Refresh;
    return grant;
  }
  public static void Main() {
    foreach (var origin in new [] {"", "null", "https://evil.invalid", Ops+".evil.invalid", Ops+"/", Ops+":443", "http://operations.local-test.invalid", Ops+"\r\nX-Evil: x"}) Check((int)Admit(origin:origin)["status"]==403,"foreign origin denied");
    foreach (var csrf in new [] {"", "bad", "test\r\n"}) Check((int)Admit(csrf:csrf)["status"]==403,"CSRF denied");
    foreach (var method in new [] {"GET","PUT","DELETE"}) Check((int)Admit(method:method)["status"]==403,"method denied");
    var disabled=Configuration(); disabled["approved"]=false; Check((int)Admit(config:disabled)["status"]==403,"unapproved gate");
    disabled=Configuration(); disabled["diagnosticsReviewed"]=false; Check((int)Admit(config:disabled)["status"]==403,"diagnostics gate");
    Check((int)Admit(path:"/v1/auth/refresh")["status"]==403,"unknown path");
    Check((int)Admit(method:"OPTIONS",requestedMethod:"POST",requestedHeaders:"content-type, x-local-test-session")["status"]==204,"preflight allowed");
    foreach(var headers in new [] {"", "content-type", "content-type, authorization", "content-type, x-local-test-session, cookie", "content-type, content-type"}) Check((int)Admit(method:"OPTIONS",requestedMethod:"POST",requestedHeaders:headers)["status"]==403,"preflight denied");
    var refreshed=Admit(); Check((int)refreshed["status"]==0,"refresh admitted"); Check((string)refreshed["backendPath"]=="/v1/auth/refresh","actual backend route");
    Check(JObject.Parse((string)refreshed["requestBody"]).Properties().Single().Name=="refresh_token","only cookie mapped to backend");
    Check((int)Admit(body:"{'refresh_token':'browser-secret'}")["status"]==422,"browser secret injection denied");
    Check((int)Admit(cookie:"")["status"]==401,"missing cookie");
    Check((int)Admit(path:"/test-session/logout",cookie:"")["status"]==204,"missing cookie logout idempotent");
    Check((bool)Admit(path:"/test-session/logout",cookie:"")["clear"],"missing cookie expiry");
    Check((int)Admit(cookie:"__Host-test-ops="+Refresh+"; __Host-test-ops="+Refresh)["status"]==400,"duplicate cookie denied");
    foreach(var secret in new [] {Refresh+"\n",Refresh+"\r\nX-Evil:1", "\""+Refresh+"\"", "short"}) Check((int)Admit(cookie:"__Host-test-ops="+secret)["status"]==400,"cookie injection denied");
    var customer=Admit(origin:Customer,cookie:"__Host-test-ops="+Refresh+"; __Host-test-customer="+new string('B',43));
    Check((string)customer["cookieName"]=="__Host-test-customer","origin chooses isolated cookie");
    Check(JObject.Parse((string)customer["requestBody"])["refresh_token"].ToString()==new string('B',43),"other product not selected");
    var start=Admit(path:"/test-session/start",body:"{'client_request_id':'"+Owner+"','phone':'+919999999999'}"); Check((int)start["status"]==0,"start admitted"); Check((string)start["backendPath"]=="/v1/auth/otp/start","start authority");
    var verify=Admit(path:"/test-session/verify",body:"{'client_login_id':'"+Owner+"','challenge_reference':'"+Owner+"','code':'123456'}"); Check((int)verify["status"]==0,"verify admitted");
    foreach(var input in new [] {"null", "[]", "not json", "{'role':'MANAGER'}", "{'client_login_id':123,'code':'123456'}"}) Check((int)Admit(path:"/test-session/verify",body:input)["status"]==422,"malformed request denied");
    var login=Shape("verify",200,Grant().ToString()); Check((int)login["status"]==200,"verify shaped"); Check(!((string)login["body"]).Contains("refresh_token")&&!((string)login["body"]).Contains(Refresh),"refresh secret stripped");
    var cookieHeader=(string)login["cookie"]; Check(cookieHeader.Contains("; Secure; HttpOnly; SameSite=Strict"),"cookie secure"); Check(cookieHeader.Contains("Path=/")&&!cookieHeader.Contains("Domain="),"host scoped"); Check(cookieHeader.Contains("Max-Age=599"),"bounded fixed expiry");
    Check((int)Shape("verify",200,Grant().ToString(),601)["status"]==502,"expired delivery not issued");
    Check((int)Shape("verify",200,Grant().ToString(),-1)["status"]==502,"backward clock cannot extend lifetime");
    var access=Shape("refresh",200,Grant(false).ToString()); Check((int)access["status"]==200 && (string)access["cookie"]=="","refresh cannot slide cookie expiry");
    var logout=Shape("logout",204,""); Check((string)logout["body"]==""&&((string)logout["cookie"]).Contains("Max-Age=0"),"logout deletion");
    var otherLogout=Shape("logout",204,"",cookie:"__Host-test-customer"); Check(((string)otherLogout["cookie"]).StartsWith("__Host-test-customer="),"logout isolation");
    foreach(var status in new [] {401,403,409,422,429,500,502,503,504,302}) {
      var error=Shape("verify",status,"{'secret':'"+Refresh+"','access_token':'do-not-echo'}");
      Check((int)error["status"]==(status==302?502:status),"controlled status"); Check(!error.ToString().Contains(Refresh)&&!error.ToString().Contains("do-not-echo")&&(string)error["cookie"]=="","error redaction");
    }
    Check(((string)Shape("refresh",401,"private")["cookie"]).Contains("Max-Age=0"),"revoked/expired session cleared");
    Check((string)Shape("logout",503,"private")["cookie"]=="","failed logout retains revocation credential");
    foreach(var payload in new [] {"", "null", "[]", "<html>private</html>", "{'refresh_token':'"+Refresh+"'}"}) Check((int)Shape("verify",200,payload)["status"]==502,"malformed success blocked");
    var bad=Grant(); bad["expires_in"]="60"; Check((int)Shape("verify",200,bad.ToString())["status"]==502,"wrong type blocked");
    bad=Grant(); bad["extra"]=Refresh; Check((int)Shape("verify",200,bad.ToString())["status"]==502,"extra credential field blocked");
    bad=Grant(); bad["refresh_token"]=Refresh+"\n"; Check((int)Shape("verify",200,bad.ToString())["status"]==502,"Set-Cookie injection blocked");
    bad=Grant(); bad["access_token"]="synthetic.access.token\n"; Check((int)Shape("verify",200,bad.ToString())["status"]==502,"bearer injection blocked");
    Check((int)Shape("start",202,"{'challenge_reference':'"+Owner+"'}")["status"]==202,"start response validated");
    Console.WriteLine($"PASS: {checks} assertions executing the exact policy expression bodies locally; NOT real APIM acceptance.");
  }
}
