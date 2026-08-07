const http = require("http");

function apiCall(method, path, cookie, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers: { "Cookie": cookie || "" },
    };
    if (body) {
      options.headers["Content-Type"] = "application/json";
      const bodyStr = JSON.stringify(body);
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    } else {
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on("error", reject);
      req.end();
    }
  });
}

(async () => {
  try {
    const adminPassword = "2f4a3e60dc0619f407aa0311";
    const loginRes = await apiCall("POST", "/api/auth/login", "", {
      account: "fanshen_superadmin", password: adminPassword,
    });
    if (loginRes.status !== 200) { console.log("登录失败"); return; }

    const setCookie = loginRes.headers["set-cookie"];
    let cookie = "";
    if (setCookie) {
      cookie = Array.isArray(setCookie) ? setCookie.map(c => c.split(";")[0]).join("; ") : setCookie.split(";")[0];
    }

    const convRes = await apiCall("GET", "/api/chat/conversations", cookie);
    const convs = JSON.parse(convRes.body).conversations || [];
    const convId = convs[0].id;

    const msgRes = await apiCall("GET", "/api/chat/conversations/" + convId + "/messages", cookie);
    const msgs = JSON.parse(msgRes.body).messages || [];
    
    // Print each message's type and fileUrl
    for (const m of msgs) {
      console.log(JSON.stringify({
        id: m.id,
        type: m.type,
        content: m.content,
        fileName: m.fileName,
        fileUrl: m.fileUrl,
        fileSize: m.fileSize,
        hasFileUrl: !!m.fileUrl,
      }));
    }
  } catch (e) {
    console.error(e.message);
  }
})();
