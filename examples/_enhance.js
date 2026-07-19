// Demo-time page enhancer, injected by scripts/serve.mjs into every served HTML
// page. Adds (1) an FPS meter and (2) a slide-in panel with the folder's
// README.md rendered as markdown (via the vendored `marked`). The generated
// example/experiment files stay untouched — this only runs under `npm run demo`.
(function () {
  // ---- FPS meter (skip if the page already has one) ----
  if (!document.getElementById("fps")) {
    var el = document.createElement("div");
    el.id = "fps";
    el.textContent = "– fps";
    el.style.cssText =
      "position:fixed;top:8px;right:12px;z-index:2147483647;font:600 15px monospace;" +
      "color:#0f0;background:rgba(0,0,0,.65);padding:4px 8px;border:1px solid #0f0;" +
      "border-radius:4px;pointer-events:none";
    document.body.appendChild(el);
    var last = performance.now(),
      count = 0,
      min = Infinity;
    (function loop(now) {
      count++;
      var dt = now - last;
      if (dt >= 500) {
        var v = Math.round((count * 1000) / dt);
        min = Math.min(min, v);
        el.textContent = v + " fps (min " + (min === Infinity ? "–" : min) + ")";
        count = 0;
        last = now;
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }

  // ---- README panel (only if a README.md sits next to the page) ----
  var readmeUrl = new URL("README.md", location.href).href;
  fetch(readmeUrl)
    .then(function (r) {
      return r.ok ? r.text() : null;
    })
    .then(function (md) {
      if (!md || !window.marked) return;

      var style = document.createElement("style");
      style.textContent =
        "#pxc-readme-btn{position:fixed;left:12px;bottom:12px;z-index:2147483647;" +
        "font:600 13px system-ui;color:#e6e6e6;background:#1b232d;border:1px solid #3a7afe;" +
        "border-radius:8px;padding:8px 12px;cursor:pointer}" +
        "#pxc-readme{position:fixed;left:0;top:0;bottom:0;width:min(600px,94vw);z-index:2147483646;" +
        "background:#0f141a;color:#dce3ea;border-right:1px solid #2a333d;box-shadow:2px 0 30px rgba(0,0,0,.6);" +
        "overflow:auto;padding:24px 28px 60px;transform:translateX(-102%);transition:transform .22s ease;" +
        "font:14px/1.6 system-ui}" +
        "#pxc-readme.open{transform:none}" +
        "#pxc-readme h1{font-size:20px;margin:.2em 0 .6em}" +
        "#pxc-readme h2{font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:#7f8ea3;" +
        "margin:28px 0 10px;border-bottom:1px solid #232a33;padding-bottom:5px}" +
        "#pxc-readme h3{font-size:14px;margin:18px 0 6px}" +
        "#pxc-readme code{background:#222;padding:1px 5px;border-radius:4px;font-size:.88em}" +
        "#pxc-readme pre{background:#161c22;padding:12px;border-radius:6px;overflow:auto}" +
        "#pxc-readme pre code{background:none;padding:0}" +
        "#pxc-readme table{border-collapse:collapse;font-size:13px}" +
        "#pxc-readme th,#pxc-readme td{border:1px solid #2a333d;padding:4px 9px;text-align:left}" +
        "#pxc-readme a{color:#6db3ff}" +
        "#pxc-readme img{max-width:100%}";
      document.head.appendChild(style);

      var panel = document.createElement("aside");
      panel.id = "pxc-readme";
      panel.innerHTML = window.marked.parse(md);

      var btn = document.createElement("button");
      btn.id = "pxc-readme-btn";
      btn.textContent = "📖 README";
      btn.addEventListener("click", function () {
        panel.classList.toggle("open");
      });

      document.body.appendChild(panel);
      document.body.appendChild(btn);

      // Deep-link: open the panel automatically when the URL ends with #readme.
      if (location.hash === "#readme") panel.classList.add("open");
    })
    .catch(function () {});
})();
