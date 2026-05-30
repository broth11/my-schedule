// PDF Export — intentional PDF-specific layouts, not a screen screenshot.
// Renders into a hidden off-screen DOM node with pdf-only classes.
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  const DAY_LETTERS    = ['A', 'B', 'C', 'D'];
  const NUMERIC_SLOTS  = ['1', '2', '3', '4', '5'];
  const SPECIAL_CYCLES = ['HOLIDAY', 'IN-SERVICE', 'PTC', 'SONGKRAN', 'NO-SCHOOL'];

  const CAT_COLORS = {
    teaching: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    homeroom:  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    advisory:  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    elb:       { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
    planning:  { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
    other:     { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
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

  // ── Monthly overview HTML builder ──────────────────────────────────────────

  function buildMonthlyPageHTML(monthKey, days, selectedClasses, scheduleAssignments, scheduleCategories, dutyColorMode) {
    const [year, month] = monthKey.split('-').map(Number);
    const monthName     = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const daysInMonth   = new Date(year, month, 0).getDate();

    const dayMap = {};
    days.forEach(d => { dayMap[d.date] = d; });

    // Build Mon-Fri weeks
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

    const WDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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
          const shortNote = note.length > 20 ? note.slice(0, 20) + '…' : note;
          tds += `<td class="pmo-day pmo-special">
            <div class="pmo-top">
              <span class="pmo-dn">${date}</span>
              <span class="pmo-sptag">${cycle}</span>
            </div>
            ${shortNote ? `<div class="pmo-note">${shortNote}</div>` : ''}
          </td>`;
          return;
        }

        const periods = getPeriodsForDay(cycle);
        const chips = periods.map(code => {
          const slot  = getSlotFromCode(code);
          const style = chipInlineStyle(code, selectedClasses, scheduleCategories, dutyColorMode);
          return `<span class="pmo-chip" style="${style}">${slot}</span>`;
        }).join('');

        const shortNote = note.length > 18 ? note.slice(0, 18) + '…' : note;

        tds += `<td class="pmo-day">
          <div class="pmo-top">
            <span class="pmo-dn">${date}</span>
            <span class="pmo-cycle">${cycle}</span>
          </div>
          ${shortNote ? `<div class="pmo-note">${shortNote}</div>` : ''}
          <div class="pmo-chips">${chips}</div>
        </td>`;
      });
      rows += `<tr>${tds}</tr>`;
    });

    return `<div class="pmo-page">
      <div class="pmo-header"><span class="pmo-title">${monthName}</span></div>
      <table class="pmo-table">
        <thead><tr>${WDAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ── Daily list HTML builder ────────────────────────────────────────────────

  function buildDailyListHTML(calendarData, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode) {
    const months = Object.keys(calendarData).sort();
    let html = '';

    months.forEach(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const days        = calendarData[monthKey] || [];
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthName   = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const dayMap      = {};
      days.forEach(d => { dayMap[d.date] = d; });

      html += `<div class="pdl-month-header">${monthName}</div>`;

      for (let date = 1; date <= daysInMonth; date++) {
        const jsDate = new Date(year, month - 1, date);
        const dow    = jsDate.getDay();
        if (dow === 0 || dow === 6) continue;

        const dayData = dayMap[date];
        if (!dayData) continue;

        const cycle     = dayData.cycle || null;
        const weekday   = jsDate.toLocaleDateString('en-US', { weekday: 'long' });
        const monthShort = jsDate.toLocaleDateString('en-US', { month: 'short' });
        const isSpecial = cycle && SPECIAL_CYCLES.includes(cycle);

        html += `<div class="pdl-day">
          <div class="pdl-day-head">
            <span class="pdl-date">${weekday}, ${monthShort} ${date}</span>
            ${cycle && !isSpecial ? `<span class="pdl-cycle">${cycle}</span>` : ''}
            ${isSpecial           ? `<span class="pdl-sptag">${cycle}</span>` : ''}
            ${!cycle              ? `<span class="pdl-noschool">No school</span>` : ''}
          </div>
          ${dayData.note ? `<div class="pdl-note">${dayData.note}</div>` : ''}`;

        if (cycle && !isSpecial) {
          const periods = getPeriodsForDay(cycle);
          html += `<div class="pdl-blocks">`;
          periods.forEach(code => {
            const slot     = getSlotFromCode(code);
            const assigned = selectedClasses.has(code);
            const cat      = assigned ? (scheduleCategories[code] || 'teaching') : null;
            const title    = scheduleAssignments[code] || '';
            const room     = scheduleRooms[code]       || '';
            const catLabel = cat ? (CAT_LABELS[cat] || cat) : '';
            const style    = chipInlineStyle(code, selectedClasses, scheduleCategories, dutyColorMode);

            html += `<div class="pdl-block${assigned ? ' assigned' : ''}">
              <span class="pdl-code" style="${style}">${slot}</span>
              <div class="pdl-info">
                ${catLabel ? `<span class="pdl-cat">${catLabel}</span>` : ''}
                ${title    ? `<span class="pdl-title">${title}</span>`  : (!assigned ? `<span class="pdl-free">—</span>` : '')}
                ${room     ? `<span class="pdl-room">${room}</span>`    : ''}
              </div>
            </div>`;
          });
          html += `</div>`;
        }

        html += `</div>`;
      }
    });

    return html;
  }

  // ── CSS strings injected into the hidden render node ──────────────────────

  const MONTHLY_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; }
.pmo-page { padding: 18px 22px 14px; }
.pmo-header { margin-bottom: 10px; }
.pmo-title { font-size: 17px; font-weight: 700; color: #111; }
.pmo-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.pmo-table th {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: #555; text-align: left; padding: 5px 7px 5px;
  border-bottom: 2px solid #ccc;
}
.pmo-table td { vertical-align: top; border: 1px solid #e0e0e0; padding: 5px 6px; }
.pmo-empty { background: #f8f8f8; }
.pmo-noschool { background: #f8f8f8; }
.pmo-special { background: #fffbeb; }
.pmo-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; }
.pmo-dn { font-size: 13px; font-weight: 700; color: #111; }
.pmo-cycle {
  font-size: 9px; font-weight: 700; color: #444;
  background: #f0f0f0; padding: 1px 5px; border-radius: 3px;
}
.pmo-sptag {
  font-size: 8px; font-weight: 700; text-transform: uppercase; color: #92400e;
  background: #fef3c7; padding: 1px 4px; border-radius: 3px;
}
.pmo-note { font-size: 8.5px; color: #777; margin-bottom: 3px; line-height: 1.3; }
.pmo-chips { display: flex; flex-wrap: wrap; gap: 2px; }
.pmo-chip {
  font-size: 8.5px; font-weight: 700; padding: 1px 4px;
  border-radius: 3px; line-height: 1.5;
}
`;

  const DAILY_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
.pdl-root { padding: 20px 24px; }
.pdl-month-header {
  font-size: 15px; font-weight: 700; color: #111;
  padding: 10px 0 6px; border-bottom: 2px solid #111;
  margin-bottom: 6px; margin-top: 14px;
}
.pdl-day {
  border-bottom: 1px solid #e5e7eb;
  padding: 7px 0 9px;
  page-break-inside: avoid;
}
.pdl-day-head { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.pdl-date { font-size: 13px; font-weight: 700; color: #111; }
.pdl-cycle {
  font-size: 10px; font-weight: 700; color: #374151;
  background: #f3f4f6; padding: 1px 6px; border-radius: 4px;
}
.pdl-sptag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; color: #92400e;
  background: #fef3c7; padding: 1px 6px; border-radius: 4px;
}
.pdl-noschool { font-size: 11px; color: #9ca3af; font-style: italic; }
.pdl-note { font-size: 11px; color: #6b7280; margin-bottom: 4px; font-style: italic; }
.pdl-blocks { display: flex; flex-direction: column; gap: 2px; margin-top: 3px; }
.pdl-block { display: flex; align-items: center; gap: 8px; }
.pdl-code {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 4px; min-width: 34px; text-align: center;
}
.pdl-info { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.pdl-cat { color: #6b7280; font-weight: 500; }
.pdl-title { color: #111; font-weight: 600; }
.pdl-room {
  color: #374151; background: #f3f4f6;
  padding: 1px 5px; border-radius: 3px; font-size: 10px;
}
.pdl-free { color: #bbb; }
`;

  // ── Render helpers ─────────────────────────────────────────────────────────

  function createRenderContainer(widthPx) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; left: -9999px; top: 0; z-index: -100;
      width: ${widthPx}px; background: #fff;
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
    const renderW = 1122;          // ~297mm @ 96dpi

    const pdf       = new jsPDF('landscape', 'mm', 'a4');
    const container = createRenderContainer(renderW);

    for (let i = 0; i < months.length; i++) {
      const monthKey = months[i];
      const days     = calendarData[monthKey] || [];
      const pageHTML = buildMonthlyPageHTML(monthKey, days, selectedClasses, scheduleAssignments, scheduleCategories, dutyColorMode);

      container.innerHTML = `<style>${MONTHLY_CSS}</style>${pageHTML}`;
      await waitFrames();

      const canvas = await html2canvas(container, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        width: renderW,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgW    = pdfW - 16;
      const imgH    = (canvas.height * imgW) / canvas.width;

      if (i > 0) pdf.addPage([pdfW, pdfH], 'landscape');
      pdf.addImage(imgData, 'PNG', 8, 8, imgW, Math.min(imgH, pdfH - 16));
    }

    document.body.removeChild(container);
    pdf.save('my-schedule-monthly-overview.pdf');
    return true;
  }

  // ── Public: generate daily list PDF ───────────────────────────────────────

  async function generateDailyListPDF(calendarData, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode) {
    const { jsPDF } = window.jspdf;
    const months = Object.keys(calendarData).sort();
    if (months.length === 0) return false;

    const pdfW = 210, pdfH = 297; // A4 portrait mm
    const renderW = 794;           // ~210mm @ 96dpi

    const bodyHTML  = buildDailyListHTML(calendarData, selectedClasses, scheduleAssignments, scheduleCategories, scheduleRooms, dutyColorMode);
    const container = createRenderContainer(renderW);
    container.innerHTML = `<style>${DAILY_CSS}</style><div class="pdl-root">${bodyHTML}</div>`;

    await waitFrames(3);

    // Measure each day to paginate without mid-day splits
    const dayEls      = container.querySelectorAll('.pdl-day');
    const pageHPx     = Math.floor(pdfH * renderW / pdfW); // portrait page height in px
    const rootPadPx   = 20; // matches .pdl-root padding-top

    // Build pages: list of [startY, endY] slices
    const pages    = [];
    let pageStart  = 0;
    let cursorY    = rootPadPx;

    dayEls.forEach(el => {
      const top    = el.offsetTop;
      const bottom = top + el.offsetHeight;
      // If this day would spill past the page, start a new page
      if (cursorY > rootPadPx && bottom > pageStart + pageHPx) {
        pages.push([pageStart, pageStart + pageHPx]);
        pageStart = top;
      }
      cursorY = bottom;
    });
    pages.push([pageStart, pageStart + pageHPx]);

    const pdf = new jsPDF('portrait', 'mm', 'a4');

    for (let p = 0; p < pages.length; p++) {
      const [sliceY] = pages[p];
      const canvas = await html2canvas(container, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        width: renderW, height: pageHPx, y: sliceY,
        windowHeight: container.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgW    = pdfW - 16;
      const imgH    = (canvas.height * imgW) / canvas.width;

      if (p > 0) pdf.addPage([pdfW, pdfH], 'portrait');
      pdf.addImage(imgData, 'PNG', 8, 8, imgW, Math.min(imgH, pdfH - 16));
    }

    document.body.removeChild(container);
    pdf.save('my-schedule-daily-list.pdf');
    return true;
  }

  window.PdfExport = { generateMonthlyOverviewPDF, generateDailyListPDF };
})();
