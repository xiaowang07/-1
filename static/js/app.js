/**
 * 上海市16区学校使用数据看板
 */

let DATA = null;
const charts = {};

const state = {
  startDate: "",
  endDate: "",
  metric: "学生答题总数",
  activeTab: "ranking",
  selectedDistrict: "",
  // 四时段对比
  compareMode: "district", // district | school
  periods: [
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
  ],
  compareDistricts: [],
  compareSchools: [],
  // 学校同事段对比
  schoolComparePeriod: { start: "", end: "" },
  schoolCompareSelected: [],
};

// ─── 数据加载 ───────────────────────────────────────────

async function loadData() {
  const res = await fetch("/data/dashboard.json");
  if (!res.ok) throw new Error("数据加载失败");
  DATA = await res.json();
  initDefaults();
  renderPresetChips();
  bindEvents();
  renderAll();
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "block";
}

function initDefaults() {
  const { dateMin, dateMax, months, defaultMetric } = DATA.meta;
  state.startDate = dateMin;
  state.endDate = dateMax;
  state.metric = defaultMetric;
  state.selectedDistrict = DATA.meta.districts[0] || "";

  document.getElementById("startDate").value = dateMin;
  document.getElementById("endDate").value = dateMax;
  document.getElementById("endDate").min = dateMin;
  document.getElementById("endDate").max = dateMax;
  document.getElementById("startDate").min = dateMin;
  document.getElementById("startDate").max = dateMax;

  // 四时段默认：按月份均分
  if (months.length >= 4) {
  const chunk = Math.ceil(months.length / 4);
  for (let i = 0; i < 4; i++) {
    const m = months[Math.min(i * chunk, months.length - 1)];
    const monthStart = m + "-01";
    const monthEnd = monthEndDate(m);
    state.periods[i] = { start: monthStart, end: monthEnd };
  }
  } else {
    state.periods.forEach((_, i) => {
      state.periods[i] = { start: dateMin, end: dateMax };
    });
  }

  state.schoolComparePeriod = { start: dateMin, end: dateMax };
  renderPeriodInputs();
  renderSchoolComparePeriodInputs();
  buildSelectorPanels();
}

function monthEndDate(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

// ─── 数据聚合 ───────────────────────────────────────────

function filterRecords(start, end, extra = {}) {
  return DATA.records.filter((r) => {
    if (r.date < start || r.date > end) return false;
    if (extra.district && r.district !== extra.district) return false;
    if (extra.districts && !extra.districts.includes(r.district)) return false;
    if (extra.school && r.school !== extra.school) return false;
    if (extra.schools && !extra.schools.includes(r.school)) return false;
    return true;
  });
}

function aggregateByDistrict(records) {
  const map = {};
  for (const r of records) {
    if (!map[r.district]) {
      map[r.district] = { district: r.district, ...zeroMetrics() };
    }
    for (const m of DATA.meta.metrics) {
      map[r.district][m] += r[m];
    }
  }
  return Object.values(map);
}

function aggregateBySchool(records, district = null) {
  const map = {};
  for (const r of records) {
    if (district && r.district !== district) continue;
    const key = r.school;
    if (!map[key]) {
      map[key] = { school: r.school, district: r.district, ...zeroMetrics() };
    }
    for (const m of DATA.meta.metrics) {
      map[key][m] += r[m];
    }
  }
  return Object.values(map);
}

function zeroMetrics() {
  const o = {};
  for (const m of DATA.meta.metrics) o[m] = 0;
  return o;
}

function addRank(items, metric) {
  const sorted = [...items].sort((a, b) => b[metric] - a[metric]);
  const rankMap = {};
  sorted.forEach((item, i) => {
    const key = item.district || item.school;
    rankMap[key] = i + 1;
  });
  return items.map((item) => ({
    ...item,
    rank: rankMap[item.district || item.school],
  }));
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return Math.round(n).toLocaleString("zh-CN");
}

// ─── 通用选择器 ─────────────────────────────────────────

function buildSelectorPanel(containerId, items, options = {}) {
  const { type = "checkbox", max = Infinity, groupBy = null, onChange } = options;
  const container = document.getElementById(containerId);
  const searchId = containerId + "Search";
  const listId = containerId + "List";
  const countId = containerId + "Count";

  container.innerHTML = `
    <div class="selector-panel">
      <div class="selector-search">
        <input type="text" id="${searchId}" placeholder="搜索${options.label || ""}..." />
      </div>
      <div class="selector-actions">
        <button type="button" data-action="all">全选</button>
        <button type="button" data-action="clear">清空</button>
        <span id="${countId}" class="selected-count">已选 0 项</span>
      </div>
      <div class="selector-list" id="${listId}"></div>
    </div>
  `;

  const selected = new Set(options.selected || []);
  const listEl = document.getElementById(listId);
  const searchEl = document.getElementById(searchId);
  const countEl = document.getElementById(countId);

  function renderList(filter = "") {
    listEl.innerHTML = "";
    const fl = filter.toLowerCase();
    let filtered = items;
    if (fl) {
      filtered = items.filter((it) => {
        const label = typeof it === "string" ? it : it.label || it.name;
        return label.toLowerCase().includes(fl);
      });
    }

    if (groupBy) {
      const groups = {};
      for (const it of filtered) {
        const g = it[groupBy] || "其他";
        if (!groups[g]) groups[g] = [];
        groups[g].push(it);
      }
      for (const g of Object.keys(groups).sort()) {
        const gl = document.createElement("div");
        gl.className = "selector-group-label";
        gl.textContent = g;
        listEl.appendChild(gl);
        for (const it of groups[g]) appendItem(it);
      }
    } else {
      for (const it of filtered) appendItem(it);
    }

    updateCount();
  }

  function appendItem(it) {
    const value = typeof it === "string" ? it : it.value || it.name;
    const label = typeof it === "string" ? it : it.label || it.name;
    const div = document.createElement("label");
    div.className = "selector-item";
    const checked = selected.has(value) ? "checked" : "";
    div.innerHTML = `<input type="${type}" value="${escapeAttr(value)}" ${checked} /><span>${escapeHtml(label)}</span>`;
    div.querySelector("input").addEventListener("change", (e) => {
      if (type === "radio") {
        selected.clear();
        if (e.target.checked) selected.add(value);
      } else {
        if (e.target.checked) {
          if (selected.size >= max) {
            e.target.checked = false;
            countEl.classList.add("warn");
            countEl.textContent = `最多选择 ${max} 项`;
            return;
          }
          selected.add(value);
        } else {
          selected.delete(value);
        }
      }
      updateCount();
      if (onChange) onChange([...selected]);
    });
    listEl.appendChild(div);
  }

  function updateCount() {
    countEl.classList.remove("warn");
    countEl.textContent = `已选 ${selected.size} 项${max < Infinity ? `（最多 ${max}）` : ""}`;
  }

  searchEl.addEventListener("input", (e) => renderList(e.target.value));
  container.querySelector('[data-action="all"]').addEventListener("click", () => {
    selected.clear();
    const toSelect = items.slice(0, max).map((it) => (typeof it === "string" ? it : it.value || it.name));
    toSelect.forEach((v) => selected.add(v));
    renderList(searchEl.value);
    if (onChange) onChange([...selected]);
  });
  container.querySelector('[data-action="clear"]').addEventListener("click", () => {
    selected.clear();
    renderList(searchEl.value);
    if (onChange) onChange([...selected]);
  });

  renderList();
  return {
    getSelected: () => [...selected],
    setSelected: (vals) => {
      selected.clear();
      vals.forEach((v) => selected.add(v));
      renderList(searchEl.value);
      updateCount();
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

// ─── 选择器实例 ─────────────────────────────────────────

let districtSelector, schoolSelector, compareDistrictSelector, compareSchoolSelector, schoolCompareSelector;

function buildSelectorPanels() {
  const districtItems = DATA.meta.districts;
  const schoolItems = DATA.meta.schools.map((s) => ({
    name: s.name,
    value: s.name,
    label: s.name,
    district: s.district,
  }));

  districtSelector = buildSelectorPanel("districtSelector", districtItems, {
    type: "radio",
    label: "区",
    selected: [state.selectedDistrict],
    onChange: (vals) => {
      state.selectedDistrict = vals[0] || "";
      renderRankingTab();
    },
  });

  schoolSelector = null; // 排名页用表格展示，不需要多选

  compareDistrictSelector = buildSelectorPanel("compareDistrictSelector", districtItems, {
    label: "区",
    selected: DATA.meta.districts.slice(0, 3),
    onChange: (vals) => {
      state.compareDistricts = vals;
      renderCompareTab();
    },
  });
  state.compareDistricts = compareDistrictSelector.getSelected();

  compareSchoolSelector = buildSelectorPanel("compareSchoolSelector", schoolItems, {
    label: "学校",
    groupBy: "district",
    max: 8,
    onChange: (vals) => {
      state.compareSchools = vals;
      renderCompareTab();
    },
  });

  schoolCompareSelector = buildSelectorPanel("schoolCompareSelector", schoolItems, {
    label: "学校",
    groupBy: "district",
    max: 4,
    onChange: (vals) => {
      state.schoolCompareSelected = vals;
      renderSchoolCompareTab();
    },
  });
}

// ─── 渲染：排名 ─────────────────────────────────────────

function renderRankingTab() {
  const records = filterRecords(state.startDate, state.endDate);
  const districtData = addRank(aggregateByDistrict(records), state.metric);
  districtData.sort((a, b) => a.rank - b.rank);

  const district = state.selectedDistrict || DATA.meta.districts[0];
  const schoolData = addRank(aggregateBySchool(records, district), state.metric);
  schoolData.sort((a, b) => a.rank - b.rank);

  renderTable("districtTable", districtData, [
    { key: "rank", label: "排名", render: (r) => rankBadge(r.rank) },
    { key: "district", label: "区" },
    ...metricColumns(),
  ]);

  renderTable("schoolTable", schoolData, [
    { key: "rank", label: "排名", render: (r) => rankBadge(r.rank) },
    { key: "school", label: "学校" },
  ...metricColumns(),
  ]);

  document.getElementById("schoolTableTitle").textContent = `${district} · 学校排名`;

  renderChart("districtBarChart", {
    title: `各区 ${DATA.meta.metricLabels[state.metric]} 排名`,
    type: "bar",
    categories: districtData.map((d) => d.district),
    series: [{ name: state.metric, data: districtData.map((d) => d[state.metric]) }],
    horizontal: true,
  });

  renderChart("schoolBarChart", {
    title: `${district} 学校 ${DATA.meta.metricLabels[state.metric]} 排名`,
    type: "bar",
    categories: schoolData.slice(0, 20).map((d) => d.school),
    series: [{ name: state.metric, data: schoolData.slice(0, 20).map((d) => d[state.metric]) }],
    horizontal: true,
  });
}

function metricColumns() {
  return DATA.meta.metrics.map((m) => ({
    key: m,
    label: DATA.meta.metricLabels[m],
    render: (r) => formatNum(r[m]),
    highlight: m === state.metric,
  }));
}

function rankBadge(rank) {
  const cls = rank <= 3 ? `rank-${rank}` : "rank-other";
  return `<span class="rank-badge ${cls}">${rank}</span>`;
}

function renderTable(containerId, rows, columns) {
  const el = document.getElementById(containerId);
  if (!rows.length) {
    el.innerHTML = '<div class="empty-hint">当前时间范围内无数据</div>';
    return;
  }
  let html = '<div class="table-wrap"><table><thead><tr>';
  for (const col of columns) {
    const style = col.highlight ? ' style="color:var(--primary);font-weight:600"' : "";
    html += `<th${style}>${col.label}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (const row of rows) {
    html += "<tr>";
    for (const col of columns) {
      const val = col.render ? col.render(row) : row[col.key];
      const style = col.highlight ? ' style="font-weight:600;color:var(--primary)"' : "";
      html += `<td${style}>${val}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  el.innerHTML = html;
}

// ─── 渲染：四时段对比 ───────────────────────────────────

function renderPeriodInputs() {
  const container = document.getElementById("periodInputs");
  container.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const slot = document.createElement("div");
    slot.className = "period-slot";
    slot.innerHTML = `
      <h4>时段 ${i + 1}</h4>
      <div class="time-row">
        <div class="field">
          <label>开始日期</label>
          <input type="date" id="period${i}Start" value="${state.periods[i].start}" min="${DATA.meta.dateMin}" max="${DATA.meta.dateMax}" />
        </div>
        <div class="field">
          <label>结束日期</label>
          <input type="date" id="period${i}End" value="${state.periods[i].end}" min="${DATA.meta.dateMin}" max="${DATA.meta.dateMax}" />
        </div>
      </div>
    `;
    container.appendChild(slot);
    slot.querySelector(`#period${i}Start`).addEventListener("change", (e) => {
      state.periods[i].start = e.target.value;
      renderCompareTab();
    });
    slot.querySelector(`#period${i}End`).addEventListener("change", (e) => {
      state.periods[i].end = e.target.value;
      renderCompareTab();
    });
  }
}

function renderCompareTab() {
  const mode = state.compareMode;
  document.getElementById("compareDistrictPanel").style.display = mode === "district" ? "block" : "none";
  document.getElementById("compareSchoolPanel").style.display = mode === "school" ? "block" : "none";

  const periodLabels = state.periods.map((p, i) => `时段${i + 1}\n${p.start}~${p.end}`);

  if (mode === "district") {
    const districts = state.compareDistricts.length ? state.compareDistricts : DATA.meta.districts.slice(0, 4);
    const series = districts.map((d) => ({
      name: d,
      type: "bar",
      data: state.periods.map((p) => {
        const recs = filterRecords(p.start, p.end, { district: d });
        return recs.reduce((s, r) => s + r[state.metric], 0);
      }),
    }));
    renderChart("compareMainChart", {
      title: `各区四时段 ${DATA.meta.metricLabels[state.metric]} 对比`,
      type: "groupedBar",
      categories: periodLabels,
      series,
    });
    renderMetricCharts("compareMetricCharts", districts, "district");
  } else {
    const schools = state.compareSchools;
    if (!schools.length) {
      document.getElementById("compareMainChart").innerHTML = '<div class="empty-hint">请在右侧搜索并勾选学校（最多8所）</div>';
      document.getElementById("compareMetricCharts").innerHTML = "";
      return;
    }
    const series = schools.map((s) => ({
      name: s,
      type: "bar",
      data: state.periods.map((p) => {
        const recs = filterRecords(p.start, p.end, { school: s });
        return recs.reduce((sum, r) => sum + r[state.metric], 0);
      }),
    }));
    renderChart("compareMainChart", {
      title: `各校四时段 ${DATA.meta.metricLabels[state.metric]} 对比`,
      type: "groupedBar",
      categories: periodLabels,
      series,
    });
    renderMetricCharts("compareMetricCharts", schools, "school");
  }
}

function renderMetricCharts(containerId, entities, entityType) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  for (const metric of DATA.meta.metrics) {
    const chartId = `metricChart_${metric}`;
    const div = document.createElement("div");
    div.className = "panel";
    div.innerHTML = `<h3>${DATA.meta.metricLabels[metric]}</h3><div id="${chartId}" class="chart chart-sm"></div>`;
    container.appendChild(div);

    const series = entities.map((entity) => ({
      name: entity,
      type: "line",
      smooth: true,
      data: state.periods.map((p) => {
        const filter = entityType === "district"
          ? { district: entity }
          : { school: entity };
        const recs = filterRecords(p.start, p.end, filter);
        return recs.reduce((s, r) => s + r[metric], 0);
      }),
    }));

    renderChart(chartId, {
      title: "",
      type: "line",
      categories: state.periods.map((_, i) => `时段${i + 1}`),
      series,
    });
  }
}

// ─── 渲染：学校同事段对比 ───────────────────────────────

function renderSchoolComparePeriodInputs() {
  const container = document.getElementById("schoolComparePeriod");
  container.innerHTML = `
    <div class="time-row">
      <div class="field">
        <label>开始日期</label>
        <input type="date" id="scStart" value="${state.schoolComparePeriod.start}" min="${DATA.meta.dateMin}" max="${DATA.meta.dateMax}" />
      </div>
      <div class="field">
        <label>结束日期</label>
        <input type="date" id="scEnd" value="${state.schoolComparePeriod.end}" min="${DATA.meta.dateMin}" max="${DATA.meta.dateMax}" />
      </div>
    </div>
  `;
  document.getElementById("scStart").addEventListener("change", (e) => {
    state.schoolComparePeriod.start = e.target.value;
    renderSchoolCompareTab();
  });
  document.getElementById("scEnd").addEventListener("change", (e) => {
    state.schoolComparePeriod.end = e.target.value;
    renderSchoolCompareTab();
  });
}

function renderSchoolCompareTab() {
  const schools = state.schoolCompareSelected;
  const { start, end } = state.schoolComparePeriod;

  if (!schools.length) {
    document.getElementById("schoolCompareChart").innerHTML = '<div class="empty-hint">请搜索并勾选 1～4 所学校进行对比</div>';
    document.getElementById("schoolCompareTable").innerHTML = "";
    document.getElementById("schoolCompareRadar").innerHTML = "";
    return;
  }

  const rows = schools.map((s) => {
    const recs = filterRecords(start, end, { school: s });
    const row = { school: s, district: recs[0]?.district || "" };
    for (const m of DATA.meta.metrics) {
      row[m] = recs.reduce((sum, r) => sum + r[m], 0);
    }
    return row;
  });

  renderTable("schoolCompareTable", rows, [
    { key: "school", label: "学校" },
    { key: "district", label: "所属区" },
    ...metricColumns(),
  ]);

  renderChart("schoolCompareChart", {
    title: `学校对比（${start} ~ ${end}）· ${DATA.meta.metricLabels[state.metric]}`,
    type: "bar",
    categories: schools,
    series: [{ name: state.metric, data: rows.map((r) => r[state.metric]) }],
  });

  // 雷达图：多指标对比
  const radarIndicators = DATA.meta.metrics.map((m) => ({
    name: DATA.meta.metricLabels[m],
    max: Math.max(...rows.map((r) => r[m]), 1) * 1.2,
  }));
  renderChart("schoolCompareRadar", {
    title: "多指标雷达对比",
    type: "radar",
    indicators: radarIndicators,
    series: rows.map((r) => ({
      name: r.school,
      value: DATA.meta.metrics.map((m) => r[m]),
    })),
  });

  // 各指标柱状对比
  const metricsContainer = document.getElementById("schoolCompareMetrics");
  metricsContainer.innerHTML = "";
  for (const metric of DATA.meta.metrics) {
    const id = `scMetric_${metric}`;
    const div = document.createElement("div");
    div.className = "panel";
    div.innerHTML = `<h3>${DATA.meta.metricLabels[metric]}</h3><div id="${id}" class="chart chart-sm"></div>`;
    metricsContainer.appendChild(div);
    renderChart(id, {
      title: "",
      type: "bar",
      categories: schools,
      series: [{ name: metric, data: rows.map((r) => r[metric]) }],
    });
  }
}

// ─── ECharts 封装 ───────────────────────────────────────

function renderChart(domId, config) {
  const el = document.getElementById(domId);
  if (!el) return;
  if (charts[domId]) {
    charts[domId].dispose();
  }
  const chart = echarts.init(el);
  charts[domId] = chart;

  let option;
  if (config.type === "bar" && config.horizontal) {
    option = {
      tooltip: { trigger: "axis" },
      grid: { left: "3%", right: "8%", bottom: "3%", containLabel: true },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: [...config.categories].reverse(), axisLabel: { width: 120, overflow: "truncate" } },
      series: config.series.map((s) => ({
        ...s,
        type: "bar",
        data: [...s.data].reverse(),
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      })),
      title: config.title ? { text: config.title, left: "center", textStyle: { fontSize: 14 } } : undefined,
    };
  } else if (config.type === "bar") {
    option = {
      tooltip: { trigger: "axis" },
      grid: { left: "3%", right: "4%", bottom: "12%", containLabel: true },
      xAxis: { type: "category", data: config.categories, axisLabel: { rotate: config.categories.length > 6 ? 30 : 0, overflow: "truncate", width: 80 } },
      yAxis: { type: "value" },
      series: config.series.map((s) => ({
        ...s,
        type: "bar",
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: { show: config.categories.length <= 6, position: "top", formatter: (p) => formatNum(p.value) },
      })),
      title: config.title ? { text: config.title, left: "center", textStyle: { fontSize: 14 } } : undefined,
    };
  } else if (config.type === "groupedBar") {
    option = {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, type: "scroll" },
      grid: { left: "3%", right: "4%", bottom: "15%", containLabel: true },
      xAxis: { type: "category", data: config.categories },
      yAxis: { type: "value" },
      series: config.series,
      title: config.title ? { text: config.title, left: "center", textStyle: { fontSize: 14 } } : undefined,
    };
  } else if (config.type === "line") {
    option = {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, type: "scroll" },
      grid: { left: "3%", right: "4%", bottom: "15%", containLabel: true },
      xAxis: { type: "category", data: config.categories },
      yAxis: { type: "value" },
      series: config.series,
      title: config.title ? { text: config.title, left: "center", textStyle: { fontSize: 14 } } : undefined,
    };
  } else if (config.type === "radar") {
    option = {
      tooltip: {},
      legend: { bottom: 0 },
      radar: { indicator: config.indicators, radius: "60%" },
      series: [{
        type: "radar",
        data: config.series.map((s) => ({ name: s.name, value: s.value })),
      }],
      title: config.title ? { text: config.title, left: "center", textStyle: { fontSize: 14 } } : undefined,
    };
  }

  chart.setOption(option);
}

// ─── 事件与总渲染 ───────────────────────────────────────

function bindEvents() {
  document.getElementById("applyTime").addEventListener("click", applyGlobalTime);
  document.getElementById("resetTime").addEventListener("click", () => {
    state.startDate = DATA.meta.dateMin;
    state.endDate = DATA.meta.dateMax;
    document.getElementById("startDate").value = state.startDate;
    document.getElementById("endDate").value = state.endDate;
    renderAll();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      state.activeTab = tab.dataset.tab;
      renderAll();
      resizeCharts();
    });
  });

  document.querySelectorAll(".metric-tabs").forEach((container) => {
    container.addEventListener("click", (e) => {
      if (!e.target.classList.contains("metric-tab")) return;
      container.querySelectorAll(".metric-tab").forEach((t) => t.classList.remove("active"));
      e.target.classList.add("active");
      state.metric = e.target.dataset.metric;
      renderAll();
    });
  });

  document.querySelectorAll('input[name="compareMode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.compareMode = e.target.value;
      renderCompareTab();
      resizeCharts();
    });
  });

  window.addEventListener("resize", resizeCharts);
}

function applyGlobalTime() {
  state.startDate = document.getElementById("startDate").value;
  state.endDate = document.getElementById("endDate").value;
  if (state.startDate > state.endDate) {
    alert("开始日期不能晚于结束日期");
    return;
  }
  renderAll();
}

function renderMetricTabs() {
  document.querySelectorAll(".metric-tabs").forEach((container) => {
    container.innerHTML = DATA.meta.metrics
      .map((m) => `<button class="metric-tab${m === state.metric ? " active" : ""}" data-metric="${m}">${DATA.meta.metricLabels[m]}</button>`)
      .join("");
  });
}

function renderPresetChips() {
  const container = document.getElementById("presetChips");
  let html = `<span class="chip" data-range="all">全部时间</span>`;
  for (const m of DATA.meta.months) {
    html += `<span class="chip" data-month="${m}">${m}</span>`;
  }
  container.innerHTML = html;
  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const month = chip.dataset.month;
      if (month) {
        state.startDate = month + "-01";
        state.endDate = monthEndDate(month);
      } else {
        state.startDate = DATA.meta.dateMin;
        state.endDate = DATA.meta.dateMax;
      }
      document.getElementById("startDate").value = state.startDate;
      document.getElementById("endDate").value = state.endDate;
      container.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderAll();
    });
  });
}

function renderAll() {
  renderMetricTabs();
  if (state.activeTab === "ranking") renderRankingTab();
  else if (state.activeTab === "compare") renderCompareTab();
  else if (state.activeTab === "school") renderSchoolCompareTab();
  setTimeout(resizeCharts, 100);
}

function resizeCharts() {
  Object.values(charts).forEach((c) => c.resize());
}

// ─── 启动 ───────────────────────────────────────────────

loadData().catch((err) => {
  document.getElementById("loading").innerHTML = `<p style="color:#dc2626">加载失败：${err.message}</p>`;
});
