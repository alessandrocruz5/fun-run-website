(() => {
  const { routes, feeRate } = window.RL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (n) => n.toFixed(2);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Mobile menu
  const menuBtn = $("#menuBtn"),
    nav = $("#nav");
  const setMenu = (open) => {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", open);
  };
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  $$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));

  // Auto-size email preview iframe to its content
  const frame = $("#emailFrame");
  const fitFrame = () => {
    try {
      frame.style.height = frame.contentDocument.documentElement.scrollHeight + "px";
    } catch {}
  };
  frame.addEventListener("load", () => {
    fitFrame();
    setTimeout(fitFrame, 300);
  });
  addEventListener("resize", fitFrame);

  // Scroll progress bar
  const bar = $("#progress");
  const onScroll = () => {
    const h = document.documentElement;
    bar.style.transform = `scaleX(${h.scrollTop / (h.scrollHeight - h.clientHeight || 1)})`;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Count-up numbers
  const countUp = (el) => {
    const end = +el.dataset.count,
      pre = el.dataset.prefix || "",
      suf = el.dataset.suffix || "";
    if (reduced) return;
    const t0 = performance.now(),
      dur = 1400;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur),
        v = Math.round(end * (1 - Math.pow(1 - p, 3)));
      el.textContent = pre + v + suf;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Route drawing
  const map = $("#routeMap");
  const drawRoute = () => {
    map.classList.remove("drawn");
    [...$$(".draw", map), $("#rLine")].forEach((p) => {
      p.classList.remove("go");
      void p.getBoundingClientRect();
      p.classList.add("go");
    });
    const area = $("#rArea");
    area.classList.remove("go");
    void area.getBoundingClientRect();
    area.classList.add("go");
    clearTimeout(drawRoute.t);
    drawRoute.t = setTimeout(() => map.classList.add("drawn"), reduced ? 0 : 2100);
  };

  // Lazy reveal on scroll
  $$("[data-stagger]").forEach((g) =>
    [...g.children].forEach((c, i) => c.style.setProperty("--i", i)),
  );
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.add("in");
        if (el === map) drawRoute();
        $$("[data-count]", el).forEach(countUp);
        io.unobserve(el);
      }),
    { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
  );
  $$("[data-reveal]").forEach((el) => io.observe(el));

  // Route tabs
  $$("#routeTabs button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const r = routes[btn.dataset.route];
      $$("#routeTabs button").forEach((b) => b.classList.toggle("on", b === btn));
      $$(".js-path").forEach((p) => p.setAttribute("d", r.path));
      $("#rFull").textContent = r.full;
      $("#rKm").textContent = r.km;
      $("#rBlurb").textContent = r.blurb;
      $("#rStart").textContent = r.start;
      $("#rGain").textContent = r.gain;
      $("#rAid").textContent = r.aid;
      $("#rCutoff").textContent = r.cutoff;
      $("#rLine").setAttribute("points", r.elevLine);
      $("#rArea").setAttribute("points", `0,120 ${r.elevLine} 600,120`);
      $("#rHl").innerHTML = r.highlights
        .map(([at, t]) => `<div class="hl"><span class="mono">${at}</span><span>${t}</span></div>`)
        .join("");
      $$("#rKm, #rBlurb, #rHl, .stats").forEach((el) => {
        el.classList.remove("swap");
        void el.offsetWidth;
        el.classList.add("swap");
      });
      drawRoute();
    }),
  );

  // Registration form
  const form = $("#regForm");
  const updateSummary = () => {
    const d = routes[form.distance.value],
      don = +form.donation.value;
    const fee = Math.round((d.price + don) * feeRate * 100) / 100,
      total = d.price + don + fee;
    $("#sFull").textContent = d.full;
    $("#sName").textContent = d.name;
    $("#sIncl").textContent = d.includes;
    $("#sSize").textContent = form.size.value;
    $("#sEntry").textContent = money(d.price);
    $("#sDon").textContent = money(don);
    $("#sFee").textContent = money(fee);
    $("#sTotal").textContent = money(total);
    $("#payBtn").textContent = `PAY $${money(total)} (TEST)`;
    const tot = $("#sTotal").parentElement;
    tot.classList.remove("swap");
    void tot.offsetWidth;
    tot.classList.add("swap");
  };

  $$("[data-pick]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.pick;
      form[key].value = btn.dataset.val;
      $$(`[data-pick="${key}"]`).forEach((b) => b.classList.toggle("on", b === btn));
      updateSummary();
    }),
  );

  const clearErr = (k) => {
    const el = $(`[data-err="${k}"]`);
    el.textContent = "";
    if (k === "card") el.hidden = true;
  };
  const showErrs = (errs) =>
    Object.entries(errs).forEach(([k, v]) => {
      const el = $(`[data-err="${k}"]`);
      if (el) {
        el.textContent = v;
        el.hidden = false;
      }
    });

  form.card.addEventListener("input", (e) => {
    e.target.value = e.target.value
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(\d{4})(?=\d)/g, "$1 ");
    clearErr("card");
  });
  form.exp.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
    clearErr("card");
  });
  form.cvc.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    clearErr("card");
  });
  form.name.addEventListener("input", () => clearErr("name"));
  form.email.addEventListener("input", () => clearErr("email"));

  $$("[data-fill]").forEach((b) =>
    b.addEventListener("click", () => {
      form.card.value = b.dataset.fill;
      form.exp.value = "12/29";
      form.cvc.value = "123";
      clearErr("card");
    }),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ["name", "email", "card"].forEach(clearErr);
    const pay = $("#payBtn"),
      label = pay.textContent;
    pay.disabled = true;
    pay.textContent = "PROCESSING TEST PAYMENT…";
    try {
      const res = await fetch(form.action, { method: "POST", body: new FormData(form) });
      const data = await res.json();
      if (!data.ok) return showErrs(data.errors);
      const o = data.order;
      $("#dFirst").textContent = o.firstName;
      $("#dEmail").textContent = o.email;
      $("#dConf").textContent = o.confirmation;
      $("#dTotal").textContent = o.totals.total;
      $("#dDon").textContent = o.totals.donation;
      $("#dDist").textContent = o.distance;
      $("#dBib").textContent = o.bib;
      $("#dName").textContent = o.name;
      $("#dCorral").textContent = o.corral;
      $("#dStart").textContent = o.start;
      const url = "email.php?c=" + encodeURIComponent(o.confirmation);
      $("#emailLink").href = url;
      $("#emailFrame").src = url;
      $("#eBib").textContent = o.bib;
      $("#eTo").textContent = o.email;
      form.hidden = true;
      $("#doneView").hidden = false;
      $("#emailView").hidden = false;
      const top = $("#register").getBoundingClientRect().top + scrollY - 20;
      scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    } catch {
      showErrs({ card: "Could not reach the test payment server." });
    } finally {
      pay.disabled = false;
      pay.textContent = label;
    }
  });

  $("#resetBtn").addEventListener("click", () => {
    ["name", "email", "card", "exp", "cvc"].forEach((k) => (form[k].value = ""));
    $("#doneView").hidden = true;
    $("#emailView").hidden = true;
    form.hidden = false;
  });
})();
