// PDF Export — intentional PDF-specific layouts, not a screen screenshot.
// Renders into a hidden off-screen DOM node with pdf-only classes.
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  const DAY_LETTERS    = ['A', 'B', 'C', 'D'];
  const NUMERIC_SLOTS  = ['1', '2', '3', '4', '5'];
  const SPECIAL_CYCLES = ['HOLIDAY', 'IN-SERVICE', 'PTC', 'SONGKRAN', 'NO-SCHOOL'];

  // A4 dimensions in px at 96 dpi
  const A4_LANDSCAPE_W = 1122; // 297mm
  const A4_LANDSCAPE_H =  794; // 210mm
  const A4_PORTRAIT_W  =  794; // 210mm
  const A4_PORTRAIT_H  = 1123; // 297mm

  const CAT_COLORS = {
    teaching: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    homeroom:  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    advisory:  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    elb:       { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },
    planning:  { bg: '#f5f5f4', text: '#57534e', border: '#d6d3d1' },
    other:     { bg: '#f7f6f5', text: '#57534e', border: '#d6d3d1' },
  };
  const DUTY_SINGLE_COLOR = { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
  const FREE_COLOR        = { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' };

  const CAT_LABELS = {
    teaching: 'Teaching', homeroom: 'Homeroom', advisory: 'Advisory',
    elb: 'ELB', planning: 'Planning', other: 'Other',
  };

  // ── Small helpers ──────────────────────────────────────────────────────────

  function buildBlockCode(letter, slot) {
    return ['FX', 'ELB'].includes(slot) ? `${letter}-${slot}` : `${letter}${slot}`;
  }

  function getSlotFromCode(code) {
    if (!code) return '';
    return code.includes('-') ? code.split('-')[1] : code.slice(1);
  }

  function getDayLetterFromCycle(cycleCode) {
    if (!cycleCode || typeof cycleCode !== 'string') return null;
    const l = cycleCode.trim().charAt(0).toUpperCase();
    return DAY_LETTERS.includes(l) ? l : null;
  }

  function getPeriodsForDay(cycleCode) {
    const letter = getDayLetterFromCycle(cycleCode);
    if (!letter) return [];
    const startSlot  = cycleCode.slice(letter.length);
    const startIndex = NUMERIC_SLOTS.indexOf(startSlot);
    const nums = startIndex > 0
      ? [...NUMERIC_SLOTS.slice(startIndex), ...NUMERIC_SLOTS.slice(0, startIndex)]
      : [...NUMERIC_SLOTS];
    const ordered = [nums[0], nums[1], nums[2], nums[3], 'FX', 'ELB', nums[4]];
    return ordered.map(slot => buildBlockCode(letter, slot));
  }

  function chipInlineStyle(code, selectedClasses, scheduleCategories, dutyColorMode) {
    const on = selectedClasses.has(code);
    if (!on) {
      return `background:${FREE_COLOR.bg};color:${FREE_COLOR.text};border:1px solid ${FREE_COLOR.border}`;
    }
    if (dutyColorMode === 'category') {
      const cat = scheduleCategories[code] || 'teaching';
      const c   = CAT_COLORS[cat] || CAT_COLORS.teaching;
      return `background:${c.bg};color:${c.text};border:1px solid ${c.border}`;
    }
    return `background:${DUTY_SINGLE_COLOR.bg};color:${DUTY_SINGLE_COLOR.text};border:1px solid ${DUTY_SINGLE_COLOR.border}`;
  }

  // ── Week grouping helpers ──────────────────────────────────────────────────

  // Returns the Monday of the week that contains jsDate.
  function getMondayOfWeek(jsDate) {
    const d   = new Date(jsDate);
    const dow = d.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d;
  }

  // Groups all calendar days (Mon–Fri only) into school weeks.
  // Returns Array<{ weekKey: string, monday: Date, days: Array<{year,month,date,data,jsDate}> }>
  function groupCalendarDaysByWeek(calendarData) {
    const allDays = [];
    Object.keys(calendarData).sort().forEach(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      (calendarData[monthKey] || []).forEach(d => {
        const jsDate = new Date(year, month - 1, d.date);
        const dow    = jsDate.getDay();
        if (dow === 0 || dow === 6) return; // skip weekends
        allDays.push({ year, month, date: d.date, data: d, jsDate });
      });
    });

    allDays.sort((a, b) => a.jsDate - b.jsDate);

    const weekMap = new Map();
    allDays.forEach(day => {
      const monday  = getMondayOfWeek(day.jsDate);
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, { monday, days: [] });
      weekMap.get(weekKey).days.push(day);
    });

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekKey, { monday, days }]) => ({ weekKey, monday, days }));
  }

  function formatWeekLabel(days) {
    if (days.length === 0) return '';
    const first      = days[0].jsDate;
    const last       = days[days.length - 1].jsDate;
    const year       = last.getFullYear();
    const firstMonth = first.toLocaleDateString('en-US', { month: 'long' });
    const lastMonth  = last.toLocaleDateString('en-US',  { month: 'long' });

    if (firstMonth === lastMonth) {
      return `${firstMonth} ${first.getDate()}–${last.getDate()}, ${year}`;
    }
    const fm = first.toLocaleDateString('en-US', { month: 'short' });
    const lm = last.toLocaleDateString('en-US',  { month: 'short' });
    return `${fm} ${first.getDate()} – ${lm} ${last.getDate()}, ${year}`;
  }

  // ── Monthly overview HTML builder ──────────────────────────────────────────

  function buildMonthlyPageHTML(monthKey, days, selectedClasses, scheduleAssignments, scheduleCategories, dutyColorMode) {
    const [year, month] = monthKey.split('-').map(Number);
    const monthName     = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const daysInMonth   = new Date(year, month, 0).getDate();

    const dayMap = {};
    days.forEach(d => { dayMap[d.date] = d; });

    // Build Mon–Fri weeks, padding the first row with empty slots
    const weeks = [];
    let week    = [];

    const firstDow   = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const emptyStart = firstDow === 0 ? 0 : (firstDow === 6 ? 0 : firstDow - 1);

    for (let i = 0; i < emptyStart && i < 5; i++) week.push(null);

    for (let date = 1; date <= daysInMonth; date++) {
      const dow = new Date(year, month - 1, date).getDay();
      if (dow === 0 || dow === 6) continue;
      week.push({ date, data: dayMap[date] || null });
      if (week.length === 5) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 5) week.push(null);
      weeks.push(week);
    }

    const numWeeks = weeks.length;
    const WDAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    let rows = '';
    weeks.forEach(wk => {
      let tds = '';
      wk.forEach(cell => {
        if (!cell) { tds += '<td class="pmo-empty"></td>'; return; }
        const { date, data } = cell;
        const cycle = data?.cycle || null;
        const note  = data?.note  || '';

        if (!data || !cycle) {
          tds += `<td class="pmo-day pmo-noschool"><span class="pmo-dn">${date}</span></td>`;
          return;
        }

        if (SPECIAL_CYCLES.includes(cycle)) {
          tds += `<td class="pmo-day pmo-special">
            <div class="pmo-top">
              <span class="pmo-dn">${date}</span>
              <span class="pmo-sptag">${cycle}</span>
            </div>
            ${note ? `<div class="pmo-note">${note}</div>` : ''}
          </td>`;
          return;
        }

        const periods = getPeriodsForDay(cycle);
        const chips = periods.map(code => {
          const slot  = getSlotFromCode(code);
          const style = chipInlineStyle(code, selectedClasses, scheduleCategories, dutyColorMode);
          return `<span class="pmo-chip" style="${style}">${slot}</span>`;
        }).join('');

        tds += `<td class="pmo-day">
          <div class="pmo-top">
            <span class="pmo-dn">${date}</span>
            <span class="pmo-cycle">${cycle}</span>
          </div>
          ${note ? `<div class="pmo-note">${note}</div>` : ''}
          <div class="pmo-chips">${chips}</div>
        </td>`;
      });
      rows += `<tr>${tds}</tr>`;
    });

    // Embed numWeeks for CSS row-height calculation via a custom property.
    // The row height = (available table body height) / numWeeks.
    // We bake this as a CSS var on the table so no JS-in-style magic is needed.
    return `<div class="pmo-page">
      <div class="pmo-header"><span class="pmo-title">${monthName}</span></div>
      <table class="pmo-table" style="--num-weeks:${numWeeks}">
        <thead><tr>${WDAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ── Daily list — week page builder ────────────────────────────────────────

  function buildWeekPageHTML(weekLabel, weekDays, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode) {
    let daysHTML = '';

    weekDays.forEach(({ jsDate, date, data }) => {
      const weekday    = jsDate.toLocaleDateString('en-US', { weekday: 'long' });
      const monthShort = jsDate.toLocaleDateString('en-US', { month: 'short' });
      const cycle      = data?.cycle || null;
      const isSpecial  = cycle && SPECIAL_CYCLES.includes(cycle);

      daysHTML += `<div class="pdw-day">
        <div class="pdw-day-head">
          <span class="pdw-date">${weekday}, ${monthShort} ${date}</span>
          ${cycle && !isSpecial ? `<span class="pdw-cycle">${cycle}</span>` : ''}
          ${isSpecial           ? `<span class="pdw-sptag">${cycle}</span>` : ''}
          ${!cycle              ? `<span class="pdw-noschool">No school</span>` : ''}
        </div>
        ${data?.note ? `<div class="pdw-note">${data.note}</div>` : ''}`;

      if (cycle && !isSpecial) {
        const periods = getPeriodsForDay(cycle);
        daysHTML += `<div class="pdw-blocks">`;
        periods.forEach(code => {
          const slot     = getSlotFromCode(code);
          const assigned = selectedClasses.has(code);
          const cat      = assigned ? (scheduleCategories[code] || 'teaching') : null;
          const title    = scheduleAssignments[code] || '';
          const room     = scheduleRooms[code]       || '';
          const catLabel = cat ? (CAT_LABELS[cat] || cat) : '';
          const style    = chipInlineStyle(code, selectedClasses, scheduleCategories, dutyColorMode);

          daysHTML += `<div class="pdw-block${assigned ? ' assigned' : ''}">
            <span class="pdw-code" style="${style}">${slot}</span>
            <div class="pdw-info">
              ${catLabel ? `<span class="pdw-cat">${catLabel}</span>` : ''}
              ${title    ? `<span class="pdw-title">${title}</span>`  : (!assigned ? `<span class="pdw-free">—</span>` : '')}
              ${room     ? `<span class="pdw-room">${room}</span>`    : ''}
            </div>
          </div>`;
        });
        daysHTML += `</div>`;
      }

      daysHTML += `</div>`;
    });

    return `<div class="pdw-page">
      <div class="pdw-week-header">${weekLabel}</div>
      <div class="pdw-days">${daysHTML}</div>
    </div>`;
  }

  // ── CSS strings ────────────────────────────────────────────────────────────

  // Monthly: fills the A4 landscape page height. The outer div is exactly
  // A4_LANDSCAPE_H px tall. The table stretches to consume remaining space.
  const MONTHLY_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; }
.pmo-page {
  width: ${A4_LANDSCAPE_W}px; height: ${A4_LANDSCAPE_H}px;
  display: flex; flex-direction: column;
  padding: 14px 18px 10px;
  overflow: hidden;
}
.pmo-header { margin-bottom: 8px; flex-shrink: 0; }
.pmo-title { font-size: 17px; font-weight: 700; color: #111; }
.pmo-table {
  flex: 1; min-height: 0;
  width: 100%; border-collapse: collapse; table-layout: fixed;
  height: 100%;
}
.pmo-table thead { flex-shrink: 0; }
.pmo-table th {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: #555; text-align: left; padding: 5px 7px;
  border-bottom: 2px solid #ccc;
}
.pmo-table tbody { height: 100%; }
.pmo-table tbody tr { height: calc(100% / var(--num-weeks, 5)); }
.pmo-table td {
  vertical-align: top; border: 1px solid #e0e0e0;
  padding: 5px 7px; overflow: hidden;
}
.pmo-empty   { background: #f8f8f8; }
.pmo-noschool { background: #f8f8f8; }
.pmo-special { background: #fffbeb; }
.pmo-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
.pmo-dn { font-size: 14px; font-weight: 700; color: #111; }
.pmo-cycle {
  font-size: 9px; font-weight: 700; color: #444;
  background: #f0f0f0; padding: 1px 5px; border-radius: 3px;
}
.pmo-sptag {
  font-size: 8px; font-weight: 700; text-transform: uppercase; color: #92400e;
  background: #fef3c7; padding: 1px 4px; border-radius: 3px;
}
.pmo-note {
  font-size: 8.5px; color: #555; margin-bottom: 4px; line-height: 1.35;
  overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.pmo-chips { display: flex; flex-wrap: wrap; gap: 2px; margin-top: auto; padding-top: 3px; }
.pmo-chip {
  font-size: 8.5px; font-weight: 700; padding: 1px 4px;
  border-radius: 3px; line-height: 1.5;
}
`;

  // Weekly daily list: fills A4 portrait. One week per page.
  const WEEKLY_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; }
.pdw-page {
  width: ${A4_PORTRAIT_W}px; height: ${A4_PORTRAIT_H}px;
  padding: 20px 24px 16px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.pdw-week-header {
  font-size: 15px; font-weight: 700; color: #111;
  padding-bottom: 8px; border-bottom: 2px solid #222;
  margin-bottom: 10px; flex-shrink: 0;
}
.pdw-days {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
}
.pdw-day {
  flex: 1; min-height: 0;
  border-bottom: 1px solid #e0e0e0;
  padding: 7px 0 6px;
  overflow: hidden;
}
.pdw-day:last-child { border-bottom: none; }
.pdw-day-head { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.pdw-date { font-size: 12px; font-weight: 700; color: #111; min-width: 148px; }
.pdw-cycle {
  font-size: 9px; font-weight: 700; color: #374151;
  background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
}
.pdw-sptag {
  font-size: 9px; font-weight: 700; text-transform: uppercase; color: #92400e;
  background: #fef3c7; padding: 1px 5px; border-radius: 3px;
}
.pdw-noschool { font-size: 10px; color: #9ca3af; font-style: italic; }
.pdw-note { font-size: 10px; color: #6b7280; font-style: italic; margin-bottom: 2px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pdw-blocks { display: flex; flex-direction: column; gap: 1px; margin-top: 2px; }
.pdw-block { display: flex; align-items: center; gap: 6px; }
.pdw-code {
  display: inline-block; font-size: 9.5px; font-weight: 700;
  padding: 2px 5px; border-radius: 3px; min-width: 30px; text-align: center;
  flex-shrink: 0;
}
.pdw-info { display: flex; align-items: center; gap: 5px; font-size: 10px; overflow: hidden; }
.pdw-cat { color: #6b7280; font-weight: 500; flex-shrink: 0; min-width: 50px; }
.pdw-title { color: #111; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pdw-room {
  color: #374151; background: #f3f4f6;
  padding: 1px 4px; border-radius: 3px; font-size: 9px;
  flex-shrink: 0; white-space: nowrap;
}
.pdw-free { color: #c0c0c0; }
`;

  // ── Preflight: assert no unsupported CSS color functions ──────────────────

  const UNSAFE_COLOR_RE = /oklch\(|(?:^|[^a-z])lch\(|(?:^|[^a-z])lab\(|color-mix\(/i;
  const CHECKED_PROPS   = [
    'color', 'backgroundColor',
    'borderColor', 'borderTopColor', 'borderRightColor',
    'borderBottomColor', 'borderLeftColor',
    'boxShadow', 'textShadow',
  ];

  function assertHtml2CanvasSafeColors(root) {
    const walk = (el) => {
      if (el.nodeType !== 1) return;
      const style = window.getComputedStyle(el);
      CHECKED_PROPS.forEach(prop => {
        const val = style[prop];
        if (val && UNSAFE_COLOR_RE.test(val)) {
          console.error(
            '[pdfExport] Unsafe color detected',
            { element: el, className: el.className, property: prop, value: val }
          );
          throw new Error(
            `PDF export blocked: unsupported CSS color detected (${prop}: ${val})`
          );
        }
      });
      el.childNodes.forEach(walk);
    };
    walk(root);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function createRenderContainer(widthPx, heightPx) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; left: -9999px; top: 0; z-index: -100;
      width: ${widthPx}px; height: ${heightPx}px;
      background: #fff; overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
    `;
    document.body.appendChild(el);
    return el;
  }

  async function waitFrames(n = 2) {
    for (let i = 0; i < n; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  // ── Public: generate monthly overview PDF ─────────────────────────────────

  async function generateMonthlyOverviewPDF(calendarData, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode) {
    const { jsPDF } = window.jspdf;
    const months = Object.keys(calendarData).sort();
    if (months.length === 0) return false;

    const pdfW = 297, pdfH = 210; // A4 landscape mm

    const pdf       = new jsPDF('landscape', 'mm', 'a4');
    const container = createRenderContainer(A4_LANDSCAPE_W, A4_LANDSCAPE_H);

    for (let i = 0; i < months.length; i++) {
      const monthKey = months[i];
      const days     = calendarData[monthKey] || [];
      const pageHTML = buildMonthlyPageHTML(monthKey, days, selectedClasses, scheduleAssignments, scheduleCategories, dutyColorMode);

      container.innerHTML = `<style>${MONTHLY_CSS}</style>${pageHTML}`;
      await waitFrames();

      assertHtml2CanvasSafeColors(container);
      const canvas = await html2canvas(container, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        width: A4_LANDSCAPE_W, height: A4_LANDSCAPE_H,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgW    = pdfW - 16;
      const imgH    = pdfH - 16;

      if (i > 0) pdf.addPage([pdfW, pdfH], 'landscape');
      pdf.addImage(imgData, 'PNG', 8, 8, imgW, imgH);
    }

    document.body.removeChild(container);
    pdf.save('my-schedule-monthly-overview.pdf');
    return true;
  }

  // ── Public: generate daily list PDF (one page per school week) ────────────

  async function generateDailyListPDF(calendarData, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode) {
    const { jsPDF } = window.jspdf;
    const weeks = groupCalendarDaysByWeek(calendarData);
    if (weeks.length === 0) return false;

    const pdfW = 210, pdfH = 297; // A4 portrait mm

    const pdf       = new jsPDF('portrait', 'mm', 'a4');
    const container = createRenderContainer(A4_PORTRAIT_W, A4_PORTRAIT_H);

    for (let i = 0; i < weeks.length; i++) {
      const { days } = weeks[i];
      const weekLabel = formatWeekLabel(days);
      const pageHTML  = buildWeekPageHTML(weekLabel, days, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode);

      container.innerHTML = `<style>${WEEKLY_CSS}</style>${pageHTML}`;
      await waitFrames();

      assertHtml2CanvasSafeColors(container);
      const canvas = await html2canvas(container, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        width: A4_PORTRAIT_W, height: A4_PORTRAIT_H,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgW    = pdfW - 16;
      const imgH    = pdfH - 16;

      if (i > 0) pdf.addPage([pdfW, pdfH], 'portrait');
      pdf.addImage(imgData, 'PNG', 8, 8, imgW, imgH);
    }

    document.body.removeChild(container);
    pdf.save('my-schedule-daily-list.pdf');
    return true;
  }

  window.PdfExport = { generateMonthlyOverviewPDF, generateDailyListPDF };
})();
