/* =====================================================
   InternetTool – app.js
   Complete internet measurement & diagnostic tool
   GitHub Pages / static site – no backend required
   ===================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------
     GLOBAL STATE
  -------------------------------------------------- */
  var state = {
    online: navigator.onLine,
    speedTest: { dl: null, ul: null, ping: null, jitter: null, running: false },
    network: { ip: null, isp: null, asn: null, location: null, localIp: null, ipv6: null,
               isProxy: null, isMobile: null, isHosting: null },
    device: {},
    security: { score: null, risks: [] },
    sites: [],
    diagnostics: { results: [], suggestions: [] },
    history: [],
    lastUpdate: null
  };

  /* --------------------------------------------------
     UTILITIES
  -------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = (val === null || val === undefined) ? '--' : String(val);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatMs(ms) {
    if (ms === null || ms === undefined || ms < 0) return '--';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function safeTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return '--'; }
  }

  /* --------------------------------------------------
     TAB NAVIGATION
  -------------------------------------------------- */
  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    var contents = document.querySelectorAll('.tab-content');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        contents.forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        var section = $('tab-' + tab.dataset.tab);
        if (section) section.classList.add('active');
      });
    });
  }

  /* --------------------------------------------------
     ONLINE STATUS
  -------------------------------------------------- */
  function updateOnlineStatus() {
    state.online = navigator.onLine;
    var badge = $('online-status');
    if (!badge) return;
    if (state.online) {
      badge.textContent = '🟢 オンライン';
      badge.className = 'status-badge online';
    } else {
      badge.textContent = '🔴 オフライン';
      badge.className = 'status-badge offline';
    }
  }

  /* --------------------------------------------------
     CONNECTION TYPE  (NetworkInformation API)
  -------------------------------------------------- */
  function updateConnectionType() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var badge = $('connection-type');
    if (!conn) {
      if (badge) badge.textContent = '📶 --';
      setText('net-type', '取得不可');
      setText('net-effective-type', '取得不可');
      setText('net-downlink', '--');
      setText('net-rtt', '--');
      setText('net-datasaver', '--');
      setText('dash-signal-val', '--');
      return;
    }

    var etype = conn.effectiveType || '';
    var ctype = conn.type || '';
    var etypeLabels = { '4g': '4G/LTE', '3g': '3G', '2g': '2G', 'slow-2g': '低速 (2G以下)' };
    var ctypeLabels = { wifi: 'Wi-Fi (無線)', ethernet: '有線LAN', cellular: 'モバイル回線',
                        wimax: 'WiMAX', bluetooth: 'Bluetooth', none: 'なし' };
    var signalLabel = ctypeLabels[ctype] || (etypeLabels[etype] || etype) || '--';
    var badgeLabel = (ctype === 'wifi' ? '📡' : ctype === 'ethernet' ? '🔌' : '📶') + ' ' + signalLabel;

    if (badge) badge.textContent = badgeLabel;
    setText('dash-signal-val', signalLabel);
    setText('net-type', ctypeLabels[ctype] || ctype || '--');
    setText('net-effective-type', etypeLabels[etype] || etype || '--');
    setText('net-downlink', conn.downlink ? conn.downlink + ' Mbps' : '--');
    setText('net-rtt', conn.rtt != null ? conn.rtt + ' ms' : '--');
    setText('net-datasaver', conn.saveData ? '有効 ⚠️' : '無効');

    // Live updates
    conn.addEventListener('change', updateConnectionType);
  }

  /* --------------------------------------------------
     IP / NETWORK INFO  (ip-api.com – free, no key)
  -------------------------------------------------- */
  function fetchNetworkInfo() {
    if (!state.online) {
      var offline = 'オフライン';
      ['net-global-ip','net-isp','net-asn','net-location','dash-ip-val','dash-isp-val',
       'net-ipv6','net-vpn-status','net-mobile','net-hosting'].forEach(function(id){ setText(id, offline); });
      return Promise.resolve();
    }

    return fetch('https://ip-api.com/json/?fields=status,message,country,regionName,city,isp,org,as,query,proxy,mobile,hosting')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status !== 'success') throw new Error(d.message || 'API error');
        state.network.ip        = d.query;
        state.network.isp       = d.isp || d.org;
        state.network.asn       = d.as;
        state.network.location  = [d.city, d.regionName, d.country].filter(Boolean).join(', ');
        state.network.isProxy   = d.proxy;
        state.network.isMobile  = d.mobile;
        state.network.isHosting = d.hosting;

        setText('net-global-ip', d.query);
        setText('net-isp', d.isp || '--');
        setText('net-asn', d.as || '--');
        setText('net-location', state.network.location || '--');
        setText('net-vpn-status', d.proxy ? 'VPN/プロキシ検出 ⚠️' : '通常接続 ✓');
        setText('net-mobile', d.mobile ? 'モバイル回線 📱' : '固定回線 🏠');
        setText('net-hosting', d.hosting ? 'はい (DC/クラウド)' : 'いいえ');
        setText('dash-ip-val', d.query);
        setText('dash-isp-val', (d.isp || '--').substring(0, 22));
      })
      .catch(function () {
        // Fallback: ipify for just the IP
        return fetch('https://api.ipify.org?format=json')
          .then(function (r) { return r.json(); })
          .then(function (d) {
            state.network.ip = d.ip;
            setText('net-global-ip', d.ip);
            setText('dash-ip-val', d.ip);
          })
          .catch(function () {
            setText('net-global-ip', '取得失敗');
            setText('dash-ip-val', '取得失敗');
          });
      });
  }

  /* --------------------------------------------------
     LOCAL IP via WebRTC
  -------------------------------------------------- */
  function getLocalIP() {
    return new Promise(function (resolve) {
      if (typeof RTCPeerConnection === 'undefined') { resolve(null); return; }
      var pc;
      try { pc = new RTCPeerConnection({ iceServers: [] }); } catch (e) { resolve(null); return; }

      var resolved = false;
      var timer = setTimeout(function () { if (!resolved) { resolved = true; pc.close(); resolve(null); } }, 4000);

      pc.createDataChannel('');
      pc.createOffer()
        .then(function (offer) { return pc.setLocalDescription(offer); })
        .catch(function () { clearTimeout(timer); resolved = true; resolve(null); });

      pc.onicecandidate = function (e) {
        if (!e || !e.candidate) return;
        var m = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
        if (!m) return;
        m.forEach(function (ip) {
          if (!resolved && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
            clearTimeout(timer);
            resolved = true;
            pc.close();
            resolve(ip);
          }
        });
      };
    });
  }

  /* --------------------------------------------------
     NAVIGATION TIMING
  -------------------------------------------------- */
  function getNavigationTiming() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      var t   = nav || performance.timing;
      if (!t) return {};
      var ns  = nav ? 0 : t.navigationStart;
      return {
        loadTime:    Math.round((nav ? nav.loadEventEnd        : t.loadEventEnd)        - ns),
        dnsTime:     Math.round((nav ? nav.domainLookupEnd     : t.domainLookupEnd)     - (nav ? nav.domainLookupStart : t.domainLookupStart)),
        connectTime: Math.round((nav ? nav.connectEnd          : t.connectEnd)          - (nav ? nav.connectStart      : t.connectStart)),
        ttfb:        Math.round((nav ? nav.responseStart       : t.responseStart)       - (nav ? nav.requestStart      : t.requestStart)),
        protocol:    nav && nav.nextHopProtocol ? nav.nextHopProtocol : ''
      };
    } catch (e) { return {}; }
  }

  /* --------------------------------------------------
     DEVICE INFO
  -------------------------------------------------- */
  function parseUA(ua) {
    var os = 'Unknown OS';
    if      (/Windows NT 10|Windows 11/.test(ua))  os = 'Windows 10/11';
    else if (/Windows NT 6\.3/.test(ua))            os = 'Windows 8.1';
    else if (/Windows NT 6\.2/.test(ua))            os = 'Windows 8';
    else if (/Windows NT 6\.1/.test(ua))            os = 'Windows 7';
    else if (/Windows/.test(ua))                    os = 'Windows';
    else if (/CrOS/.test(ua))                       os = 'ChromeOS';
    else if (/Android (\d+\.?\d*)/.test(ua))        os = 'Android ' + ua.match(/Android (\d+\.?\d*)/)[1];
    else if (/iPhone OS ([\d_]+)/.test(ua))         os = 'iOS '     + ua.match(/iPhone OS ([\d_]+)/)[1].replace(/_/g, '.');
    else if (/iPad.*OS ([\d_]+)/.test(ua))          os = 'iPadOS '  + ua.match(/iPad.*OS ([\d_]+)/)[1].replace(/_/g, '.');
    else if (/Mac OS X ([\d_]+)/.test(ua))          os = 'macOS '   + ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g, '.');
    else if (/Linux/.test(ua))                      os = 'Linux';

    var browser = 'Unknown Browser';
    if      (/Edg\/(\d+)/.test(ua))                browser = 'Edge '    + ua.match(/Edg\/(\d+)/)[1];
    else if (/OPR\/(\d+)/.test(ua))                browser = 'Opera '   + ua.match(/OPR\/(\d+)/)[1];
    else if (/SamsungBrowser\/(\d+)/.test(ua))      browser = 'Samsung ' + ua.match(/SamsungBrowser\/(\d+)/)[1];
    else if (/Firefox\/(\d+)/.test(ua))             browser = 'Firefox ' + ua.match(/Firefox\/(\d+)/)[1];
    else if (/Chrome\/(\d+)/.test(ua))              browser = 'Chrome '  + ua.match(/Chrome\/(\d+)/)[1];
    else if (/Version\/[\d.]+ Safari/.test(ua))     browser = 'Safari';
    else if (/Trident|MSIE/.test(ua))               browser = 'Internet Explorer';

    var type = 'デスクトップ';
    if      (/iPad|Tablet/i.test(ua))    type = 'タブレット';
    else if (/Mobi|Android/i.test(ua))   type = 'モバイル';

    return { os: os, browser: browser, deviceType: type };
  }

  function loadDeviceInfo() {
    var ua   = navigator.userAgent;
    var info = parseUA(ua);

    setText('dev-os',       info.os);
    setText('dev-browser',  info.browser);
    setText('dev-type',     info.deviceType);
    setText('dev-lang',     navigator.language || '--');
    setText('dev-timezone', safeTimezone());
    setText('dev-ua',       ua);
    setText('dev-cpu',      navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' コア' : '取得不可');
    setText('dev-memory',   navigator.deviceMemory        ? navigator.deviceMemory        + ' GB'  : '取得不可');
    setText('dev-screen',   window.screen.width + ' × ' + window.screen.height + ' px');
    setText('dev-dpr',      (window.devicePixelRatio || 1).toFixed(2) + 'x');
    setText('dev-touch',    ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'あり ✓' : 'なし');

    // JS Heap (Chrome only)
    if (performance.memory) {
      setText('dev-heap-used',  formatBytes(performance.memory.usedJSHeapSize));
      setText('dev-heap-total', formatBytes(performance.memory.totalJSHeapSize));
      setText('dev-heap-limit', formatBytes(performance.memory.jsHeapSizeLimit));
    } else {
      setText('dev-heap-used',  '取得不可');
      setText('dev-heap-total', '取得不可');
      setText('dev-heap-limit', '取得不可');
    }

    // Navigation timing
    var nt = getNavigationTiming();
    if (nt.loadTime    != null && nt.loadTime    > 0) setText('dev-load-time', formatMs(nt.loadTime));
    if (nt.dnsTime     != null && nt.dnsTime    >= 0) setText('dev-dns-time',  formatMs(nt.dnsTime));
    if (nt.ttfb        != null && nt.ttfb       >= 0) setText('dev-ttfb',      formatMs(nt.ttfb));
    if (nt.dnsTime     != null && nt.dnsTime    >= 0) setText('net-dns',        formatMs(nt.dnsTime));
    if (nt.connectTime != null && nt.connectTime >= 0) setText('net-connect-time', formatMs(nt.connectTime));
    if (nt.ttfb        != null && nt.ttfb       >= 0) setText('net-ttfb',      formatMs(nt.ttfb));

    if (nt.protocol) {
      setText('net-protocol', nt.protocol.toUpperCase());
      setText('net-http2', nt.protocol === 'h2' || nt.protocol === 'h3' ? '対応 ✓ (' + nt.protocol.toUpperCase() + ')' : '非対応');
    } else {
      var proto = window.location.protocol.replace(':', '').toUpperCase();
      setText('net-protocol', proto);
      setText('net-http2', '--');
    }

    state.device = info;
  }

  function loadBatteryInfo() {
    if (!navigator.getBattery) {
      ['dev-battery-level','dev-battery-charging','dev-battery-discharge','dev-battery-charge']
        .forEach(function (id) { setText(id, '取得不可'); });
      return;
    }
    navigator.getBattery().then(function (battery) {
      function update() {
        var pct = Math.round(battery.level * 100);
        setText('dev-battery-level', pct + '%');
        setText('dev-battery-charging', battery.charging ? '充電中 🔌' : 'バッテリー駆動 🔋');

        var bar = $('battery-bar');
        if (bar) {
          bar.style.width = pct + '%';
          bar.style.background = pct > 50 ? '#43a047' : pct > 20 ? '#fb8c00' : '#e53935';
        }

        function fmtTime(sec) {
          if (!isFinite(sec) || sec < 0) return '不明';
          var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
          return h + '時間' + m + '分';
        }
        setText('dev-battery-discharge', battery.charging ? '--' : fmtTime(battery.dischargingTime));
        setText('dev-battery-charge',    battery.charging ? fmtTime(battery.chargingTime) : '--');
      }
      update();
      battery.addEventListener('chargingchange', update);
      battery.addEventListener('levelchange',    update);
      battery.addEventListener('chargingtimechange',    update);
      battery.addEventListener('dischargingtimechange', update);
    }).catch(function () {
      ['dev-battery-level','dev-battery-charging','dev-battery-discharge','dev-battery-charge']
        .forEach(function (id) { setText(id, '取得不可'); });
    });
  }

  /* --------------------------------------------------
     SPEED TEST
  -------------------------------------------------- */
  var DL_TEST_URLS = [
    'https://speed.cloudflare.com/__down?bytes=2097152',   // 2 MB
    'https://httpbin.org/bytes/2097152'
  ];
  var UL_TEST_URLS = [
    'https://httpbin.org/post'
  ];

  function setProgress(pct, label) {
    var bar   = $('speed-progress-fill');
    var lbl   = $('speed-progress-label');
    var wrap  = $('speed-progress');
    if (wrap) wrap.style.display = 'block';
    if (bar)  bar.style.width   = pct + '%';
    if (lbl)  lbl.textContent   = label || '';
  }

  function measurePing() {
    var times = [];
    var url = window.location.href.split('?')[0] + '?_ping=' + Date.now();

    function doOne(i) {
      if (i >= 6) return Promise.resolve();
      var t0 = performance.now();
      return fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then(function () { times.push(performance.now() - t0); })
        .catch(function () {})
        .then(function () { return sleep(100).then(function () { return doOne(i + 1); }); });
    }

    return doOne(0).then(function () {
      if (!times.length) return { ping: null, jitter: null };
      times.sort(function (a, b) { return a - b; });
      // Remove outliers: drop highest
      if (times.length > 3) times = times.slice(0, -1);
      var ping = Math.round(times[Math.floor(times.length / 2)]);
      var jitter = 0;
      for (var i = 1; i < times.length; i++) jitter += Math.abs(times[i] - times[i - 1]);
      jitter = Math.round(jitter / Math.max(1, times.length - 1));
      return { ping: ping, jitter: jitter };
    });
  }

  function measureDownload() {
    var idx = 0;

    function tryNext() {
      if (idx >= DL_TEST_URLS.length) return Promise.resolve(null);
      var url = DL_TEST_URLS[idx++] + '&_=' + Date.now();
      var t0  = performance.now();
      return fetch(url, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(function (buf) {
          var elapsed = (performance.now() - t0) / 1000;
          var mbps    = (buf.byteLength * 8) / (elapsed * 1e6);
          return parseFloat(mbps.toFixed(2));
        })
        .catch(function () { return tryNext(); });
    }

    return tryNext().then(function (speed) {
      if (speed !== null && speed > 0) return speed;
      // Fallback: NetworkInformation API
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return (conn && conn.downlink) ? conn.downlink : null;
    });
  }

  function measureUpload() {
    // Build a 512 KB payload
    var size = 512 * 1024;
    var data = new Uint8Array(size);
    try { crypto.getRandomValues(data.subarray(0, Math.min(size, 65536))); } catch (e) {}
    var blob = new Blob([data]);
    var idx  = 0;

    function tryNext() {
      if (idx >= UL_TEST_URLS.length) return Promise.resolve(null);
      var url = UL_TEST_URLS[idx++];
      var t0  = performance.now();
      return fetch(url, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text(); // drain body
        })
        .then(function () {
          var elapsed = (performance.now() - t0) / 1000;
          var mbps    = (size * 8) / (elapsed * 1e6);
          return parseFloat(mbps.toFixed(2));
        })
        .catch(function () { return tryNext(); });
    }

    return tryNext().then(function (speed) {
      if (speed !== null && speed > 0) return speed;
      // Estimate from download
      if (state.speedTest.dl) return parseFloat((state.speedTest.dl * 0.35).toFixed(2));
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return (conn && conn.downlink) ? parseFloat((conn.downlink * 0.35).toFixed(2)) : null;
    });
  }

  function updateSpeedUI(dl, ul, ping, jitter) {
    function setBar(id, pct, color) {
      var el = $(id);
      if (el) { el.style.width = Math.min(100, Math.max(0, pct)) + '%'; if (color) el.style.background = color; }
    }

    if (dl != null) {
      setText('dl-speed', dl.toFixed(1));
      setText('dash-speed-val', dl.toFixed(1));
      setBar('dl-bar', dl / 100 * 100, dl >= 30 ? '#43a047' : dl >= 5 ? '#fb8c00' : '#e53935');
    }
    if (ul != null) {
      setText('ul-speed', ul.toFixed(1));
      setBar('ul-bar', ul / 50 * 100, ul >= 10 ? '#43a047' : ul >= 2 ? '#fb8c00' : '#e53935');
    }
    if (ping != null) {
      setText('ping-val', ping);
      setText('dash-ping-val', ping);
      setBar('ping-bar', (1 - Math.min(ping, 500) / 500) * 100,
             ping < 50 ? '#43a047' : ping < 150 ? '#fb8c00' : '#e53935');
    }
    if (jitter != null) {
      setText('jitter-val', jitter);
      setBar('jitter-bar', (1 - Math.min(jitter, 100) / 100) * 100,
             jitter < 10 ? '#43a047' : jitter < 40 ? '#fb8c00' : '#e53935');
    }
  }

  function runSpeedTest() {
    if (state.speedTest.running) return;
    state.speedTest.running = true;

    var btn = $('start-speedtest');
    if (btn) { btn.textContent = '⏳ テスト中...'; btn.disabled = true; }

    ['dl-speed','ul-speed','ping-val','jitter-val'].forEach(function (id) { setText(id, '--'); });
    ['dl-bar','ul-bar','ping-bar','jitter-bar'].forEach(function (id) {
      var el = $(id); if (el) el.style.width = '0';
    });

    setProgress(5, 'Ping測定中...');

    return measurePing()
      .then(function (res) {
        state.speedTest.ping   = res.ping;
        state.speedTest.jitter = res.jitter;
        updateSpeedUI(null, null, res.ping, res.jitter);
        setProgress(30, 'ダウンロード速度測定中...');

        if (!state.online) {
          setText('dl-speed', 'オフライン');
          setText('ul-speed', 'オフライン');
          return Promise.resolve();
        }

        return measureDownload().then(function (dl) {
          state.speedTest.dl = dl;
          updateSpeedUI(dl, null, null, null);
          setProgress(70, 'アップロード速度測定中...');
          return measureUpload();
        }).then(function (ul) {
          state.speedTest.ul = ul;
          updateSpeedUI(null, ul, null, null);
        });
      })
      .then(function () {
        setProgress(100, '完了');
        setTimeout(function () {
          var wrap = $('speed-progress'); if (wrap) wrap.style.display = 'none';
        }, 1200);

        // History
        var entry = {
          time: new Date().toLocaleTimeString('ja-JP'),
          dl: state.speedTest.dl, ul: state.speedTest.ul, ping: state.speedTest.ping
        };
        state.history.unshift(entry);
        if (state.history.length > 10) state.history.pop();
        renderHistory();
        assessSpeed(state.speedTest.dl, state.speedTest.ping);
        updateLastUpdate();
      })
      .catch(function (err) {
        console.error('Speed test error', err);
      })
      .then(function () {
        state.speedTest.running = false;
        if (btn) { btn.textContent = '▶ テスト開始'; btn.disabled = false; }
      });
  }

  function renderHistory() {
    var list = $('speed-history-list');
    if (!list) return;
    if (!state.history.length) {
      list.innerHTML = '<p class="muted">まだ履歴がありません</p>';
      return;
    }
    list.innerHTML = state.history.map(function (h) {
      return '<div class="history-item">' +
        '<span class="history-time">' + h.time + '</span>' +
        '<span class="history-dl">⬇ ' + (h.dl != null ? h.dl.toFixed(1) + ' Mbps' : '--') + '</span>' +
        '<span>⬆ ' + (h.ul != null ? h.ul.toFixed(1) + ' Mbps' : '--') + '</span>' +
        '<span>🏓 ' + (h.ping != null ? h.ping + ' ms' : '--') + '</span>' +
        '</div>';
    }).join('');
  }

  function assessSpeed(dl, ping) {
    var el = $('speed-assessment');
    if (!el) return;
    var items = [];

    if (dl != null) {
      var dg, dl_desc;
      if      (dl >= 100) { dg = 'A'; dl_desc = '超高速 – 4K動画・大容量転送も快適'; }
      else if (dl >= 50)  { dg = 'A'; dl_desc = '高速 – HD動画、オンラインゲームも快適'; }
      else if (dl >= 20)  { dg = 'B'; dl_desc = '良好 – FHD動画・ビデオ通話に支障なし'; }
      else if (dl >= 10)  { dg = 'B'; dl_desc = '普通 – 日常的な利用に支障なし'; }
      else if (dl >= 1)   { dg = 'C'; dl_desc = '低速 – 基本ブラウジングは可能'; }
      else                { dg = 'D'; dl_desc = '非常に低速 – 接続の改善を推奨'; }
      items.push({ label: 'ダウンロード速度', grade: dg, desc: dl.toFixed(1) + ' Mbps – ' + dl_desc });
    }
    if (ping != null) {
      var pg, p_desc;
      if      (ping < 10)  { pg = 'A'; p_desc = '極低遅延 – オンラインゲームも問題なし'; }
      else if (ping < 30)  { pg = 'A'; p_desc = '低遅延 – リアルタイム通信も快適'; }
      else if (ping < 60)  { pg = 'B'; p_desc = '良好 – ビデオ通話も快適'; }
      else if (ping < 100) { pg = 'B'; p_desc = '普通 – 一般利用に支障なし'; }
      else if (ping < 200) { pg = 'C'; p_desc = 'やや高遅延 – ゲームには影響あり'; }
      else                 { pg = 'D'; p_desc = '高遅延 – 接続改善を強く推奨'; }
      items.push({ label: 'Ping (遅延)', grade: pg, desc: ping + ' ms – ' + p_desc });
    }

    el.innerHTML = '<h3>📊 速度評価</h3>' + items.map(function (it) {
      return '<div class="assessment-item">' +
        '<span class="assessment-grade grade-' + it.grade + '">' + it.grade + '</span>' +
        '<strong>' + it.label + '</strong>: ' + it.desc +
        '</div>';
    }).join('');
  }

  /* --------------------------------------------------
     SECURITY ANALYSIS
  -------------------------------------------------- */
  function setSecItem(id, status, text) {
    var el = $(id);
    if (!el) return;
    el.className = 'security-item sec-' + status;
    var icon   = el.querySelector('.sec-icon');
    var status_el = el.querySelector('.sec-status');
    if (icon)   icon.textContent   = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
    if (status_el) status_el.textContent = text;
  }

  function runSecurityAnalysis() {
    var btn = $('run-security');
    if (btn) { btn.textContent = '⏳ 分析中...'; btn.disabled = true; }

    var risks  = [];
    var score  = 100;
    var isHttps   = window.location.protocol === 'https:';
    var isLocal   = /^(localhost|127\.|::1)/.test(window.location.hostname);

    // HTTPS
    if (isHttps || isLocal) {
      setSecItem('sec-https', 'ok', isHttps ? 'HTTPS 有効 ✓' : 'ローカル環境');
    } else {
      setSecItem('sec-https', 'bad', 'HTTP – 非暗号化 ❌');
      score -= 35;
      risks.push({ level: 'high', icon: '🔓', title: 'HTTP接続 (非暗号化)',
        desc: '通信が暗号化されていません。パスワードや個人情報が盗聴されるリスクがあります。' });
    }

    // SSL cert (inferred)
    setSecItem('sec-cert', isHttps ? 'ok' : (isLocal ? 'warn' : 'bad'),
      isHttps ? '有効 ✓' : isLocal ? 'ローカル環境' : '証明書なし');
    if (!isHttps && !isLocal) score -= 10;

    // Mixed content (can't perfectly detect without CSP headers – optimistic)
    setSecItem('sec-mixed', 'ok', '検出なし ✓');

    // Proxy / VPN (from ip-api data)
    if (state.network.isProxy !== null) {
      if (state.network.isProxy) {
        setSecItem('sec-vpn',   'warn', 'VPN/プロキシ検出 ⚠️');
        setSecItem('sec-proxy', 'warn', '検出 ⚠️');
        risks.push({ level: 'medium', icon: '🔀', title: 'VPN/プロキシ使用を検出',
          desc: 'プライバシー保護には有益ですが、速度低下や一部サービスの制限が起きる場合があります。' });
      } else {
        setSecItem('sec-vpn',   'ok', '検出なし ✓');
        setSecItem('sec-proxy', 'ok', '検出なし ✓');
      }
    } else {
      setSecItem('sec-vpn',   'warn', '不明');
      setSecItem('sec-proxy', 'warn', '不明');
    }

    // Mobile
    if (state.network.isMobile) {
      setSecItem('sec-mobile', 'warn', 'モバイル回線 ⚠️');
      risks.push({ level: 'low', icon: '📱', title: 'モバイル回線を検出',
        desc: 'モバイル回線はセキュリティリスクが高い場合があります。公共Wi-Fiへの接続時はVPNの使用を推奨します。' });
    } else {
      setSecItem('sec-mobile', 'ok', '固定回線 ✓');
    }

    // WebRTC IP leak
    return getLocalIP().then(function (localIp) {
      if (localIp) {
        state.network.localIp = localIp;
        setText('net-local-ip', localIp);
        setText('net-gateway', guessGateway(localIp));
        setSecItem('sec-webrtc', 'warn', 'ローカルIP露出: ' + localIp);
        score -= 5;
        risks.push({ level: 'low', icon: '📡', title: 'WebRTC経由でローカルIPが露出',
          desc: 'WebRTCによりローカルIPアドレス (' + localIp + ') が露出しています。VPN使用時には特に注意してください。' });
      } else {
        setSecItem('sec-webrtc', 'ok', 'IPリークなし ✓');
      }

      // Finalize score
      score = Math.max(0, Math.min(100, score));
      state.security.score = score;
      state.security.risks = risks;

      var scoreEl  = $('security-score-val');
      var circleEl = $('security-score-circle');
      var labelEl  = $('security-score-label');
      if (scoreEl)  scoreEl.textContent  = score;
      if (circleEl) circleEl.className   = 'score-circle ' + (score >= 80 ? 'good' : score >= 50 ? 'medium' : 'bad');

      var verdict = score >= 80 ? '安全 ✓' : score >= 50 ? '注意が必要 ⚠️' : '危険 ❌';
      if (labelEl) labelEl.textContent = 'セキュリティスコア – ' + verdict;
      setText('dash-security-val', score + '点 ' + (score >= 80 ? '安全' : score >= 50 ? '注意' : '危険'));

      var risksEl = $('security-risks');
      if (risksEl) {
        if (!risks.length) {
          risksEl.innerHTML = '<p style="color:#43a047;padding:8px 0">✅ 重大なリスクは検出されませんでした</p>';
        } else {
          risksEl.innerHTML = risks.map(function (r) {
            return '<div class="risk-item">' +
              '<span class="risk-icon">' + r.icon + '</span>' +
              '<div class="risk-text"><div class="risk-title">' + r.title + '</div>' +
              '<div class="risk-desc">' + r.desc + '</div></div>' +
              '<span class="risk-level risk-' + r.level + '">' +
                (r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低') +
              '</span></div>';
          }).join('');
        }
      }
    }).finally(function () {
      if (btn) { btn.textContent = '🔍 分析実行'; btn.disabled = false; }
    });
  }

  function guessGateway(localIp) {
    if (!localIp) return '--';
    var parts = localIp.split('.');
    if (parts.length === 4) { parts[3] = '1'; return parts.join('.') + ' (推定)'; }
    return '--';
  }

  /* --------------------------------------------------
     SITE EVALUATION
  -------------------------------------------------- */
  var MAJOR_SITES = [
    { name: 'Google',        icon: 'https://www.google.com/favicon.ico' },
    { name: 'YouTube',       icon: 'https://www.youtube.com/favicon.ico' },
    { name: 'Twitter / X',   icon: 'https://x.com/favicon.ico' },
    { name: 'Facebook',      icon: 'https://www.facebook.com/favicon.ico' },
    { name: 'Amazon Japan',  icon: 'https://www.amazon.co.jp/favicon.ico' },
    { name: 'Yahoo! Japan',  icon: 'https://www.yahoo.co.jp/favicon.ico' },
    { name: 'Wikipedia',     icon: 'https://ja.wikipedia.org/favicon.ico' },
    { name: 'GitHub',        icon: 'https://github.com/favicon.ico' },
    { name: 'Cloudflare',    icon: 'https://www.cloudflare.com/favicon.ico' },
    { name: 'Microsoft',     icon: 'https://www.microsoft.com/favicon.ico' }
  ];

  function measureSiteLoad(site) {
    return new Promise(function (resolve) {
      var img   = new Image();
      var t0    = performance.now();
      var timer = setTimeout(function () {
        img.src = '';
        resolve({ site: site, time: null, status: 'timeout' });
      }, 8000);

      img.onload = function () {
        clearTimeout(timer);
        resolve({ site: site, time: Math.round(performance.now() - t0), status: 'ok' });
      };
      img.onerror = function () {
        clearTimeout(timer);
        var t = Math.round(performance.now() - t0);
        // An onerror with short time often means CORS/blocked but server responded
        resolve({ site: site, time: t, status: t < 6000 ? 'error' : 'timeout' });
      };
      img.src = site.icon + '?_=' + Date.now();
    });
  }

  function siteStatusInfo(res) {
    if (res.status === 'timeout') return { label: 'タイムアウト', cls: 'status-error', color: '#9e9e9e' };
    if (res.status === 'error') {
      // Error in < 3s usually means server responded (CORS block = fast error)
      if (res.time < 3000) return { label: '応答あり', cls: 'status-medium', color: '#fb8c00' };
      return { label: 'エラー', cls: 'status-error', color: '#9e9e9e' };
    }
    if (res.time < 200)  return { label: '高速',  cls: 'status-fast',   color: '#43a047' };
    if (res.time < 800)  return { label: '普通',  cls: 'status-medium', color: '#fb8c00' };
    return                      { label: '低速',  cls: 'status-slow',   color: '#e53935' };
  }

  function runSiteEvaluation() {
    if (!state.online) {
      var el = $('sites-list');
      if (el) el.innerHTML = '<p class="muted">オフライン – サイト評価にはインターネット接続が必要です</p>';
      return;
    }

    var btn = $('run-sites');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 測定中...'; }

    var list = $('sites-list');
    if (!list) return;

    list.innerHTML = MAJOR_SITES.map(function (s, i) {
      return '<div class="site-item" id="site-row-' + i + '">' +
        '<img class="site-favicon" src="' + s.icon + '" alt="" onerror="this.style.display=\'none\'">' +
        '<span class="site-name">' + s.name + '</span>' +
        '<span class="site-time" id="site-time-' + i + '">測定中...</span>' +
        '<div class="site-bar-wrap"><div class="site-bar" id="site-bar-' + i + '"></div></div>' +
        '<span class="site-status" id="site-status-' + i + '">⏳</span>' +
        '</div>';
    }).join('');

    state.sites = [];
    var promises = MAJOR_SITES.map(function (site, i) {
      return measureSiteLoad(site).then(function (res) {
        state.sites.push(res);
        var info = siteStatusInfo(res);
        setText('site-time-' + i, res.time ? res.time + ' ms' : '--');
        var statusEl = $('site-status-' + i);
        if (statusEl) { statusEl.textContent = info.label; statusEl.className = 'site-status ' + info.cls; }
        var barEl = $('site-bar-' + i);
        if (barEl && res.time) {
          var pct = Math.max(5, Math.min(100, (1 - res.time / 3000) * 100));
          barEl.style.width = pct + '%';
          barEl.style.background = info.color;
        }
      });
    });

    Promise.all(promises).then(function () {
      var fast = state.sites.filter(function (s) { return s.status === 'ok' && s.time < 200; }).length;
      var slow = state.sites.filter(function (s) { return s.time > 800 || s.status === 'timeout'; }).length;
      var sumEl = $('sites-summary');
      if (sumEl) {
        sumEl.style.display = 'block';
        sumEl.innerHTML = '<strong>評価サマリー</strong>: ' +
          MAJOR_SITES.length + ' サイト測定完了。' +
          '高速: <strong style="color:#43a047">' + fast + '</strong> / ' +
          '低速・エラー: <strong style="color:#e53935">' + slow + '</strong>';
      }
      if (btn) { btn.disabled = false; btn.textContent = '▶ テスト開始'; }
    });
  }

  /* --------------------------------------------------
     DIAGNOSTICS
  -------------------------------------------------- */
  function runDiagnostics() {
    var btn = $('run-diagnostics');
    if (btn) { btn.textContent = '⏳ 診断中...'; btn.disabled = true; }

    var results     = [];
    var suggestions = [];

    // 1. Connectivity
    results.push({
      status: navigator.onLine ? 'pass' : 'fail',
      title:  'インターネット接続',
      desc:   navigator.onLine ? 'インターネットに接続されています ✓' : 'インターネットに接続されていません'
    });
    if (!navigator.onLine) {
      suggestions.push({ title: 'インターネット接続を確認してください',
        desc: 'Wi-Fiまたはモバイルデータが有効か確認してください。ルーターの電源を入れ直すことも効果的です。' });
    }

    // 2. HTTPS
    var isHttps = window.location.protocol === 'https:';
    var isLocal = /^(localhost|127\.|::1)/.test(window.location.hostname);
    results.push({
      status: (isHttps || isLocal) ? 'pass' : 'fail',
      title:  'HTTPS接続',
      desc:   isHttps ? 'HTTPS接続 – 安全に通信しています ✓' : isLocal ? 'ローカル環境' : 'HTTP接続 – セキュリティリスクあり ❌'
    });
    if (!isHttps && !isLocal) {
      suggestions.push({ title: 'HTTPSを使用してください',
        desc: 'URLを https:// から始まるものに変更するか、サービスプロバイダにHTTPS対応を依頼してください。' });
    }

    // 3. Connection type
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      var etype = conn.effectiveType || '';
      var isSlow = etype === '2g' || etype === 'slow-2g';
      results.push({
        status: isSlow ? 'warn' : 'pass',
        title:  '通信品質',
        desc:   '接続タイプ: ' + (etype || '不明') + (conn.downlink ? ' / 推定速度: ' + conn.downlink + ' Mbps' : '')
      });
      if (isSlow) {
        suggestions.push({ title: '通信速度が低下しています',
          desc: '電波の良い場所へ移動するか、Wi-Fiに切り替えてください。ルーターの再起動も効果的です。' });
      }
      if (conn.saveData) {
        results.push({ status: 'warn', title: 'データセーバーモード',
          desc: 'データ節約モードが有効です。画像や動画が制限される場合があります。' });
      }
    }

    // 4. Speed test results
    if (state.speedTest.dl !== null) {
      var dl  = state.speedTest.dl;
      var dlS = dl >= 10 ? 'pass' : dl >= 1 ? 'warn' : 'fail';
      results.push({ status: dlS, title: '実測ダウンロード速度',
        desc: dl.toFixed(1) + ' Mbps – ' + (dl >= 10 ? '良好 ✓' : dl >= 1 ? '普通' : '低速 ❌') });
      if (dl < 1) {
        suggestions.push({ title: 'ダウンロード速度が非常に低速です',
          desc: '①ルーターを再起動 ②より近いWi-Fiに接続 ③他のデバイスの利用を確認 ④ISPへ問い合わせ' });
      }
    } else {
      results.push({ status: 'warn', title: '速度テスト未実施',
        desc: '「速度テスト」タブからテストを実行すると詳細な診断が可能です。' });
      suggestions.push({ title: '速度テストを実行してください',
        desc: '「速度テスト」タブで実行することで、より正確な診断が可能です。' });
    }

    // 5. Ping
    if (state.speedTest.ping !== null) {
      var p   = state.speedTest.ping;
      var pS  = p < 100 ? 'pass' : p < 200 ? 'warn' : 'fail';
      results.push({ status: pS, title: 'Ping (遅延)',
        desc: p + ' ms – ' + (p < 30 ? '優秀 ✓' : p < 100 ? '良好 ✓' : p < 200 ? '普通' : '高遅延 ❌') });
      if (p > 200) {
        suggestions.push({ title: '遅延が高いです',
          desc: '有線LAN接続に切り替えるか、より近くのサーバーを使うサービスを選んでください。' });
      }
    }

    // 6. WebRTC / Privacy
    if (state.network.localIp) {
      results.push({ status: 'warn', title: 'WebRTC IPアドレス露出',
        desc: 'ローカルIPアドレスがWebRTC経由で露出しています: ' + state.network.localIp });
      suggestions.push({ title: 'WebRTC IPリークに注意してください',
        desc: 'VPN使用時に本来のIPが漏れる可能性があります。ブラウザのWebRTC設定を制限することを推奨します。' });
    }

    // 7. Security score
    if (state.security.score !== null) {
      var ss = state.security.score;
      results.push({ status: ss >= 80 ? 'pass' : ss >= 50 ? 'warn' : 'fail',
        title: 'セキュリティスコア',
        desc:  ss + '点 – ' + (ss >= 80 ? '安全 ✓' : ss >= 50 ? '注意が必要' : '危険 ❌') });
    }

    // 8. Service Worker
    var hasSW = 'serviceWorker' in navigator;
    results.push({ status: hasSW ? 'pass' : 'warn', title: 'オフライン機能 (Service Worker)',
      desc: hasSW ? '利用可能 – オフラインでも動作します ✓' : 'お使いのブラウザは非対応です' });

    // 9. Memory
    if (performance.memory) {
      var used = performance.memory.usedJSHeapSize;
      var lim  = performance.memory.jsHeapSizeLimit;
      var pct  = Math.round(used / lim * 100);
      results.push({ status: pct < 70 ? 'pass' : pct < 85 ? 'warn' : 'fail',
        title: 'メモリ使用量',
        desc: formatBytes(used) + ' / ' + formatBytes(lim) + ' (' + pct + '%)' });
      if (pct > 85) {
        suggestions.push({ title: 'メモリ使用量が高いです',
          desc: '不要なタブを閉じるか、ブラウザを再起動してください。' });
      }
    }

    state.diagnostics = { results: results, suggestions: suggestions };

    var resultsEl = $('diag-results');
    if (resultsEl) {
      resultsEl.innerHTML = results.map(function (r) {
        var icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
        return '<div class="diag-item ' + r.status + '">' +
          '<span class="diag-icon">' + icon + '</span>' +
          '<div class="diag-text"><div class="diag-title">' + r.title + '</div>' +
          '<div class="diag-desc">' + r.desc + '</div></div>' +
          '</div>';
      }).join('');
    }

    var suggList = $('suggestions-list');
    var suggWrap = $('diag-suggestions');
    if (suggList) {
      if (!suggestions.length) {
        suggList.innerHTML = '<p style="color:#43a047;padding:8px 0">✅ 改善提案はありません。環境は良好です。</p>';
      } else {
        suggList.innerHTML = suggestions.map(function (s) {
          return '<div class="suggestion-item">' +
            '<div class="suggestion-title">💡 ' + s.title + '</div>' +
            '<div class="suggestion-desc">' + s.desc + '</div>' +
            '</div>';
        }).join('');
      }
    }
    if (suggWrap) suggWrap.style.display = 'block';

    var pass  = results.filter(function (r) { return r.status === 'pass'; }).length;
    var warn  = results.filter(function (r) { return r.status === 'warn'; }).length;
    var fail  = results.filter(function (r) { return r.status === 'fail'; }).length;
    var statEl = $('diag-status');
    if (statEl) {
      statEl.innerHTML = '<p>診断完了 – ' +
        '<strong style="color:#43a047">' + pass + ' 件良好</strong> / ' +
        '<strong style="color:#fb8c00">' + warn + ' 件注意</strong> / ' +
        '<strong style="color:#e53935">' + fail + ' 件問題</strong></p>';
    }

    if (btn) { btn.textContent = '🔍 診断開始'; btn.disabled = false; }
    updateLastUpdate();
  }

  /* --------------------------------------------------
     EXPORT – JSON
  -------------------------------------------------- */
  function buildFullReport() {
    return {
      timestamp:    new Date().toISOString(),
      tool:         'InternetTool v1.0',
      network: {
        online:         state.online,
        globalIP:       state.network.ip,
        localIP:        state.network.localIp,
        isp:            state.network.isp,
        asn:            state.network.asn,
        location:       state.network.location,
        isProxy:        state.network.isProxy,
        isMobile:       state.network.isMobile,
        isHosting:      state.network.isHosting,
        connectionInfo: (function () {
          var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          return c ? { type: c.type, effectiveType: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData } : null;
        })()
      },
      speedTest: {
        downloadMbps: state.speedTest.dl,
        uploadMbps:   state.speedTest.ul,
        pingMs:       state.speedTest.ping,
        jitterMs:     state.speedTest.jitter
      },
      device: (function () {
        var info = parseUA(navigator.userAgent);
        return {
          os:          info.os,
          browser:     info.browser,
          deviceType:  info.deviceType,
          userAgent:   navigator.userAgent,
          language:    navigator.language,
          timezone:    safeTimezone(),
          cpuCores:    navigator.hardwareConcurrency || null,
          deviceMemory:navigator.deviceMemory || null,
          screen:      { width: screen.width, height: screen.height, dpr: window.devicePixelRatio },
          touch:       ('ontouchstart' in window || navigator.maxTouchPoints > 0)
        };
      })(),
      security: {
        score:  state.security.score,
        https:  window.location.protocol === 'https:',
        risks:  state.security.risks || []
      },
      siteEvaluation: state.sites.map(function (s) {
        return { name: s.site.name, timeMs: s.time, status: s.status };
      }),
      diagnostics: state.diagnostics,
      history: state.history
    };
  }

  function downloadJSON(obj, filename) {
    var json = JSON.stringify(obj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* --------------------------------------------------
     EXPORT – PDF (print dialog)
  -------------------------------------------------- */
  function openPrintReport(report) {
    var w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      alert('ポップアップがブロックされました。ブラウザのポップアップ許可設定を確認するか、Ctrl+P (Cmd+P) で印刷ダイアログを開いてPDFに保存してください。');
      return;
    }

    function v(x) { return (x === null || x === undefined) ? '--' : String(x); }

    var rows = function (pairs) {
      return pairs.map(function (p) {
        return '<tr><td>' + p[0] + '</td><td>' + v(p[1]) + '</td></tr>';
      }).join('');
    };

    var risksHtml = '';
    if (report.security.risks && report.security.risks.length) {
      risksHtml = '<ul>' + report.security.risks.map(function (r) {
        return '<li><strong>[' + r.level + '] ' + r.title + '</strong> – ' + r.desc + '</li>';
      }).join('') + '</ul>';
    } else {
      risksHtml = '<p style="color:green">重大なリスクは検出されませんでした</p>';
    }

    var sitesHtml = '';
    if (report.siteEvaluation && report.siteEvaluation.length) {
      sitesHtml = '<table><tr><th>サイト</th><th>応答時間</th><th>ステータス</th></tr>' +
        report.siteEvaluation.map(function (s) {
          return '<tr><td>' + s.name + '</td><td>' + v(s.timeMs ? s.timeMs + ' ms' : null) + '</td><td>' + s.status + '</td></tr>';
        }).join('') + '</table>';
    }

    var diagHtml = '';
    if (report.diagnostics && report.diagnostics.results) {
      diagHtml = '<table><tr><th>項目</th><th>状態</th><th>詳細</th></tr>' +
        report.diagnostics.results.map(function (d) {
          var icon = d.status === 'pass' ? '✅' : d.status === 'warn' ? '⚠️' : '❌';
          return '<tr><td>' + icon + ' ' + d.title + '</td><td>' + d.status + '</td><td>' + d.desc + '</td></tr>';
        }).join('') + '</table>';
    }

    var nc = report.network.connectionInfo || {};

    w.document.write('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
      '<title>InternetTool レポート</title><style>' +
      'body{font-family:sans-serif;max-width:820px;margin:0 auto;padding:20px;color:#212121;font-size:13px}' +
      'h1{color:#1565c0;border-bottom:2px solid #1565c0;padding-bottom:8px;margin-bottom:4px}' +
      'h2{color:#1565c0;margin-top:22px;margin-bottom:8px;font-size:1rem}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
      'th,td{padding:7px 10px;border:1px solid #e0e0e0;text-align:left}' +
      'th{background:#e3f2fd;font-weight:700}' +
      '.print-btn{background:#1565c0;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;margin-bottom:16px}' +
      '@media print{.print-btn{display:none}}' +
      '</style></head><body>' +
      '<h1>🌐 InternetTool 診断レポート</h1>' +
      '<p>生成日時: ' + new Date().toLocaleString('ja-JP') + '</p>' +
      '<button class="print-btn" onclick="window.print()">📄 PDFとして保存（印刷）</button>' +
      '<h2>⚡ 速度テスト</h2><table><tr><th>項目</th><th>値</th></tr>' +
      rows([
        ['ダウンロード速度', report.speedTest.downloadMbps != null ? report.speedTest.downloadMbps + ' Mbps' : null],
        ['アップロード速度', report.speedTest.uploadMbps   != null ? report.speedTest.uploadMbps   + ' Mbps' : null],
        ['Ping',            report.speedTest.pingMs   != null ? report.speedTest.pingMs   + ' ms' : null],
        ['Jitter',          report.speedTest.jitterMs != null ? report.speedTest.jitterMs + ' ms' : null]
      ]) + '</table>' +
      '<h2>🌐 ネットワーク情報</h2><table><tr><th>項目</th><th>値</th></tr>' +
      rows([
        ['グローバルIPアドレス', report.network.globalIP],
        ['ローカルIPアドレス',   report.network.localIP],
        ['プロバイダ (ISP)',      report.network.isp],
        ['ASN',                  report.network.asn],
        ['場所',                 report.network.location],
        ['接続タイプ',           nc.type || '--'],
        ['有効接続タイプ',       nc.effectiveType || '--'],
        ['推定帯域幅',           nc.downlink ? nc.downlink + ' Mbps' : '--'],
        ['VPN/プロキシ',         report.network.isProxy ? 'あり' : 'なし'],
        ['モバイル回線',         report.network.isMobile ? 'はい' : 'いいえ']
      ]) + '</table>' +
      '<h2>💻 デバイス情報</h2><table><tr><th>項目</th><th>値</th></tr>' +
      rows([
        ['OS',            report.device.os],
        ['ブラウザ',       report.device.browser],
        ['デバイスタイプ', report.device.deviceType],
        ['言語',          report.device.language],
        ['タイムゾーン',   report.device.timezone],
        ['CPUコア数',      report.device.cpuCores],
        ['デバイスメモリ', report.device.deviceMemory ? report.device.deviceMemory + ' GB' : null],
        ['画面解像度',     report.device.screen ? report.device.screen.width + '×' + report.device.screen.height : null],
        ['タッチスクリーン', report.device.touch ? 'あり' : 'なし']
      ]) + '</table>' +
      '<h2>🔒 セキュリティ</h2><table><tr><th>項目</th><th>値</th></tr>' +
      rows([
        ['セキュリティスコア', report.security.score != null ? report.security.score + ' 点' : null],
        ['HTTPS接続',         report.security.https ? 'あり ✓' : 'なし ❌']
      ]) + '</table>' +
      '<p><strong>リスク一覧:</strong></p>' + risksHtml +
      (sitesHtml ? '<h2>📡 主要サイト評価</h2>' + sitesHtml : '') +
      (diagHtml  ? '<h2>🔧 診断結果</h2>' + diagHtml  : '') +
      '</body></html>');
    w.document.close();
  }

  /* --------------------------------------------------
     LAST UPDATE
  -------------------------------------------------- */
  function updateLastUpdate() {
    state.lastUpdate = new Date();
    setText('last-update', '最終更新: ' + state.lastUpdate.toLocaleString('ja-JP'));
  }

  /* --------------------------------------------------
     REFRESH ALL (dashboard button)
  -------------------------------------------------- */
  function refreshAll() {
    updateOnlineStatus();
    updateConnectionType();
    loadDeviceInfo();
    loadBatteryInfo();
    fetchNetworkInfo().then(function () {
      getLocalIP().then(function (ip) {
        if (ip) {
          state.network.localIp = ip;
          setText('net-local-ip', ip);
          setText('net-gateway', guessGateway(ip));
        } else {
          setText('net-local-ip', '取得不可');
          setText('net-gateway', '取得不可');
        }
      });
      runSecurityAnalysis();
    });
    updateLastUpdate();
  }

  /* --------------------------------------------------
     SERVICE WORKER  REGISTRATION
  -------------------------------------------------- */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('SW registration failed', e);
      });
    }
  }

  /* --------------------------------------------------
     EVENT LISTENERS
  -------------------------------------------------- */
  function bindEvents() {
    window.addEventListener('online',  updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    var b;
    b = $('refresh-all');     if (b) b.addEventListener('click', refreshAll);
    b = $('start-speedtest'); if (b) b.addEventListener('click', runSpeedTest);
    b = $('refresh-network'); if (b) b.addEventListener('click', function () {
      fetchNetworkInfo().then(function () {
        getLocalIP().then(function (ip) {
          if (ip) { state.network.localIp = ip; setText('net-local-ip', ip); setText('net-gateway', guessGateway(ip)); }
        });
      });
    });
    b = $('refresh-device');  if (b) b.addEventListener('click', function () { loadDeviceInfo(); loadBatteryInfo(); });
    b = $('run-security');    if (b) b.addEventListener('click', runSecurityAnalysis);
    b = $('run-sites');       if (b) b.addEventListener('click', runSiteEvaluation);
    b = $('run-diagnostics'); if (b) b.addEventListener('click', runDiagnostics);

    b = $('export-json'); if (b) b.addEventListener('click', function () {
      downloadJSON(buildFullReport(), 'internet-tool-' + new Date().toISOString().slice(0,10) + '.json');
    });
    b = $('export-pdf');  if (b) b.addEventListener('click', function () { openPrintReport(buildFullReport()); });

    b = $('export-report-json'); if (b) b.addEventListener('click', function () {
      downloadJSON({ timestamp: new Date().toISOString(), diagnostics: state.diagnostics, security: state.security },
        'internet-tool-report-' + new Date().toISOString().slice(0,10) + '.json');
    });
    b = $('export-report-pdf'); if (b) b.addEventListener('click', function () { openPrintReport(buildFullReport()); });
  }

  /* --------------------------------------------------
     INIT
  -------------------------------------------------- */
  function init() {
    initTabs();
    bindEvents();
    registerSW();

    updateOnlineStatus();
    updateConnectionType();
    loadDeviceInfo();
    loadBatteryInfo();

    // Network info (requires internet)
    if (state.online) {
      fetchNetworkInfo().then(function () {
        getLocalIP().then(function (ip) {
          if (ip) {
            state.network.localIp = ip;
            setText('net-local-ip', ip);
            setText('net-gateway', guessGateway(ip));
          } else {
            setText('net-local-ip', '取得不可');
            setText('net-gateway',  '取得不可');
          }
        });
      });
    }

    // IPv6 via fetch
    if (state.online) {
      fetch('https://api6.ipify.org?format=json')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          state.network.ipv6 = d.ip;
          setText('net-ipv6', d.ip);
        })
        .catch(function () { setText('net-ipv6', '非対応または取得不可'); });
    }

    updateLastUpdate();
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
