// PDF Export — direct jsPDF vector/text drawing. No html2canvas, no DOM screenshots.
(function () {
  'use strict';

  // ── Page geometry (mm) ────────────────────────────────────────────────────

  // Monthly overview — A4 landscape
  const MO_W = 297, MO_H = 210;
  const MO_ML = 8, MO_MR = 8, MO_MT = 10, MO_MB = 8;
  const MO_CW      = MO_W - MO_ML - MO_MR;  // 281 mm content width
  const MO_COL_W   = MO_CW / 5;             // 56.2 mm per column
  const MO_TITLE_Y = MO_MT + 6;             // 16 mm  – title baseline
  const MO_HLINE_Y = MO_MT + 8;             // 18 mm  – underline
  const MO_WDAY_Y  = MO_MT + 12;            // 22 mm  – weekday label baseline
  const MO_GRID_Y0 = MO_MT + 14;            // 24 mm  – grid top
  const MO_GRID_Y1 = MO_H - MO_MB;          // 202 mm – grid bottom
  const MO_GRID_H  = MO_GRID_Y1 - MO_GRID_Y0; // 178 mm

  // Daily list — A4 portrait
  const DL_W = 210, DL_H = 297;
  const DL_ML = 10, DL_MR = 10, DL_MT = 12, DL_MB = 10;
  const DL_CW      = DL_W - DL_ML - DL_MR;  // 190 mm content width
  const DL_HDR_Y   = DL_MT + 7;             // 19 mm  – week header baseline
  const DL_HLINE_Y = DL_MT + 9;             // 21 mm  – header underline
  const DL_DAYS_Y0 = DL_MT + 12;            // 24 mm  – days start
  const DL_DAYS_H  = DL_H - DL_MB - DL_DAYS_Y0; // 263 mm
  const DL_DAY_MAX = 64;                    // cap day height (mm)

  // ── Color palette ─────────────────────────────────────────────────────────

  const CLR = {
    black:       '#111111',
    dark:        '#333333',
    gray:        '#555555',
    mid:         '#777777',
    light:       '#aaaaaa',
    faint:       '#d8d8d8',
    emptyCell:   '#f3f3f2',
    specialCell: '#fffbeb',
    cycleBg:     '#f0f0f0',
    cycleText:   '#555555',
    cycleBorder: '#cccccc',
    spTagBg:     '#fef3c7',
    spTagText:   '#92400e',
    spTagBorder: '#fcd34d',
    noteText:    '#666666',
    overlayBar:  '#bfdbfe',
    overlayLbl:  '#6b7280',
    overlayText: '#1e3a8a',
    roomBg:      '#f3f4f6',
    roomBorder:  '#d6d3d1',
    roomText:    '#374151',
    catText:     '#78716c',
    freeBg:      '#f3f4f6',
    freeBorder:  '#e5e7eb',
    freeText:    '#9ca3af',
    dutyBg:      '#d1fae5',
    dutyBorder:  '#6ee7b7',
    dutyText:    '#065f46',
    noSchool:    '#aaaaaa',
  };

  const CAT_COLORS = {
    teaching: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    homeroom:  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    advisory:  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    elb:       { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },
    planning:  { bg: '#f5f5f4', text: '#57534e', border: '#d6d3d1' },
    meeting:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
    coverage:  { bg: '#e2e8f0', text: '#334155', border: '#94a3b8' },
    'after-school': { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
    other:     { bg: '#f7f6f5', text: '#57534e', border: '#d6d3d1' },
  };

  const CAT_LABELS = {
    teaching:'Teaching', homeroom:'Homeroom', advisory:'Advisory',
    elb:'ELB', planning:'Planning', meeting:'Meeting', coverage:'Coverage',
    'after-school':'After School', other:'Other',
  };

  const MANUAL_BUSY_TITLE = 'Busy';
  const SPECIAL_CYCLES = ['HOLIDAY', 'IN-SERVICE', 'PTC', 'SONGKRAN', 'NO-SCHOOL'];
  const {
    DAY_LETTERS,
    DEFAULT_SCHEDULE_BLOCK_MODEL,
    getCoreSlots,
    buildBlockCode,
    normalizeBlockCode,
    normalizeBlockCodeForModel,
    getSlotFromCode,
    getSlotLabel,
    getScheduleEntriesForCycle,
  } = window.ScheduleBlockModel;

  // ── Low-level jsPDF helpers ────────────────────────────────────────────────

  function setFont(doc, size, weight) {
    doc.setFontSize(size);
    doc.setFont('helvetica', weight || 'normal');
  }

  function drawText(doc, str, x, y, { size=9, bold=false, italic=false, color=CLR.black, align='left' } = {}) {
    doc.setFontSize(size);
    const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    doc.setFont('helvetica', style);
    doc.setTextColor(color);
    doc.text(String(str), x, y, { align });
    return doc.getTextWidth(String(str));
  }

  function getTextW(doc, str, size, bold) {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    return doc.getTextWidth(String(str));
  }

  // Truncate str to fit in maxW mm (adds … if cut). Requires font to be set by caller.
  function truncate(doc, str, maxW, size, bold) {
    if (!str) return '';
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    if (doc.getTextWidth(str) <= maxW) return str;
    let s = str;
    while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // Wrap str to maxLines lines at maxW mm. Returns array of strings.
  function wrapText(doc, str, maxW, maxLines, size, bold) {
    if (!str) return [''];
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(str, maxW);
    if (lines.length <= maxLines) return lines;
    const out = lines.slice(0, maxLines);
    let last = out[maxLines - 1];
    while (last.length > 1 && doc.getTextWidth(last + '…') > maxW) last = last.slice(0,-1);
    out[maxLines - 1] = last + '…';
    return out;
  }

  function fillRect(doc, x, y, w, h, fill, stroke) {
    if (fill)   doc.setFillColor(fill);
    if (stroke) doc.setDrawColor(stroke);
    const s = fill && stroke ? 'FD' : fill ? 'F' : stroke ? 'S' : null;
    if (s) doc.rect(x, y, w, h, s);
  }

  function fillRoundRect(doc, x, y, w, h, r, fill, stroke) {
    if (fill)   doc.setFillColor(fill);
    if (stroke) doc.setDrawColor(stroke);
    const s = fill && stroke ? 'FD' : fill ? 'F' : stroke ? 'S' : null;
    if (s) doc.roundedRect(x, y, w, h, r, r, s);
  }

  function hline(doc, x1, x2, y, color, width) {
    doc.setLineWidth(width || 0.2);
    doc.setDrawColor(color || CLR.faint);
    doc.line(x1, y, x2, y);
  }

  // ── Schedule helpers ──────────────────────────────────────────────────────

  function getDayLetter(cycle) {
    if (!cycle) return null;
    const l = cycle.trim().charAt(0).toUpperCase();
    return DAY_LETTERS.includes(l) ? l : null;
  }
  function hasSelectedBlock(selClasses, code, modelId) {
    const normalizedCode = normalizeBlockCodeForModel(code, modelId || DEFAULT_SCHEDULE_BLOCK_MODEL);
    if (selClasses.has(normalizedCode)) return true;
    const day = normalizedCode.charAt(0);
    const slot = getSlotFromCode(normalizedCode);
    if ((modelId || DEFAULT_SCHEDULE_BLOCK_MODEL) === 'ms-static-block' && slot === 'FXSB') {
      return ['FX', 'SB'].some(aliasSlot => selClasses.has(buildBlockCode(day, aliasSlot)));
    }
    return false;
  }

  function valueForBlock(map, code, modelId) {
    const normalizedCode = normalizeBlockCodeForModel(code, modelId || DEFAULT_SCHEDULE_BLOCK_MODEL);
    if (Object.prototype.hasOwnProperty.call(map || {}, normalizedCode)) return map[normalizedCode];
    const day = normalizedCode.charAt(0);
    const slot = getSlotFromCode(normalizedCode);
    if ((modelId || DEFAULT_SCHEDULE_BLOCK_MODEL) === 'ms-static-block' && slot === 'FXSB') {
      for (const aliasSlot of ['FX', 'SB']) {
        const aliasCode = buildBlockCode(day, aliasSlot);
        if (Object.prototype.hasOwnProperty.call(map || {}, aliasCode)) return map[aliasCode];
      }
    }
    return undefined;
  }

  function getAssignmentsForBlock(code, cycle, teacherBlocks, assignments, rooms, catMap, selClasses, modelId) {
    const normalizedCode = normalizeBlockCodeForModel(code, modelId || DEFAULT_SCHEDULE_BLOCK_MODEL);
    if (!hasSelectedBlock(selClasses, normalizedCode, modelId)) return [];

    const blocks = (teacherBlocks || []).filter(block => {
      const constraints = block.cycleDayConstraints || [];
      return normalizeBlockCodeForModel(block.blockCode, modelId || DEFAULT_SCHEDULE_BLOCK_MODEL) === normalizedCode &&
        (!cycle || constraints.length === 0 || constraints.includes(cycle));
    });
    if (blocks.length) return blocks;

    const value = valueForBlock(assignments, normalizedCode, modelId);
    const titles = Array.isArray(value) ? value : (value ? [value] : []);
    if (titles.length) {
      return titles.map(title => ({
        blockCode: normalizedCode,
        title,
        room: valueForBlock(rooms, normalizedCode, modelId) || null,
        category: valueForBlock(catMap, normalizedCode, modelId) || 'teaching',
        selected: true,
        source: 'manual',
        cycleDayConstraints: []
      }));
    }

    return [{
      blockCode: normalizedCode,
      title: MANUAL_BUSY_TITLE,
      room: valueForBlock(rooms, normalizedCode, modelId) || null,
      category: valueForBlock(catMap, normalizedCode, modelId) || 'teaching',
      selected: true,
      source: 'manual',
      cycleDayConstraints: []
    }];
  }
  function getScheduleEntriesForDay(cycle, modelId, teacherBlocks, assignments, rooms, catMap, selClasses) {
    const letter = getDayLetter(cycle);
    if (!letter) return [];
    const asCode = buildBlockCode(letter, 'AS');
    const hasAfterSchool = getAssignmentsForBlock(asCode, cycle, teacherBlocks, assignments, rooms, catMap, selClasses, modelId).length > 0;
    return getScheduleEntriesForCycle(cycle, modelId || DEFAULT_SCHEDULE_BLOCK_MODEL, hasAfterSchool, 'expanded');
  }
  function getPeriodsForDay(cycle, modelId, teacherBlocks, assignments, rooms, catMap, selClasses) {
    return getScheduleEntriesForDay(cycle, modelId, teacherBlocks, assignments, rooms, catMap, selClasses).map(entry => entry.blockCode);
  }

  function getPdfPeriodLabel(entry) {
    const slot = entry?.slot || getSlotFromCode(entry?.blockCode);
    if (slot === 'FXSB') return 'FX/SB';
    return entry?.periodLabel || getSlotLabel(slot, 'expanded');
  }

  function getPdfBlockBadgeLabel(code) {
    const normalizedCode = normalizeBlockCode(code);
    return getSlotFromCode(normalizedCode) === 'FXSB' ? normalizedCode : normalizedCode;
  }

  function blockColors(code, cycle, selClasses, catMap, dutyMode, teacherBlocks, assignments, rooms, modelId) {
    const normalizedCode = normalizeBlockCodeForModel(code, modelId || DEFAULT_SCHEDULE_BLOCK_MODEL);
    const blocks = getAssignmentsForBlock(code, cycle, teacherBlocks, assignments, rooms, catMap, selClasses, modelId);
    if (!hasSelectedBlock(selClasses, normalizedCode, modelId)) return { bg: CLR.freeBg, text: CLR.freeText, border: CLR.freeBorder };
    if (dutyMode === 'category') {
      const cat = blocks[0]?.category || valueForBlock(catMap, normalizedCode, modelId) || 'teaching';
      return CAT_COLORS[cat] || CAT_COLORS.teaching;
    }
    return { bg: CLR.dutyBg, text: CLR.dutyText, border: CLR.dutyBorder };
  }

  // ── Week grouping helpers ─────────────────────────────────────────────────

  function getMondayOfWeek(d) {
    const r = new Date(d);
    const dow = r.getDay();
    r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
    return r;
  }

  function groupCalendarDaysByWeek(calendarData) {
    const all = [];
    Object.keys(calendarData).sort().forEach(mk => {
      const [y, m] = mk.split('-').map(Number);
      (calendarData[mk] || []).forEach(d => {
        const j = new Date(y, m-1, d.date);
        const dow = j.getDay();
        if (dow === 0 || dow === 6) return;
        all.push({ year:y, month:m, date:d.date, data:d, jsDate:j });
      });
    });
    all.sort((a,b) => a.jsDate - b.jsDate);
    const map = new Map();
    all.forEach(day => {
      const mon = getMondayOfWeek(day.jsDate);
      const k   = mon.toISOString().slice(0,10);
      if (!map.has(k)) map.set(k, { monday:mon, days:[] });
      map.get(k).days.push(day);
    });
    return [...map.entries()].sort(([a],[b]) => a.localeCompare(b))
      .map(([k,{monday,days}]) => ({ weekKey:k, monday, days }));
  }

  function formatWeekLabel(days) {
    if (!days.length) return '';
    const f = days[0].jsDate, l = days[days.length-1].jsDate;
    const yr = l.getFullYear();
    const fm = f.toLocaleDateString('en-US',{month:'long'});
    const lm = l.toLocaleDateString('en-US',{month:'long'});
    if (fm === lm) return `${fm} ${f.getDate()}–${l.getDate()}, ${yr}`;
    return `${f.toLocaleDateString('en-US',{month:'short'})} ${f.getDate()} – ${l.toLocaleDateString('en-US',{month:'short'})} ${l.getDate()}, ${yr}`;
  }

  // ── Monthly overview page ─────────────────────────────────────────────────

  function drawMonthlyPage(doc, monthKey, days, selClasses, assignments, catMap, dutyMode, overlay, teacherBlocks, modelId, rooms) {
    const [year, month] = monthKey.split('-').map(Number);
    const monthName = new Date(year, month-1).toLocaleDateString('en-US',{month:'long', year:'numeric'});
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayMap = {};
    days.forEach(d => { dayMap[d.date] = d; });

    // Build Mon–Fri week grid (null = empty slot)
    const weeks = [];
    let week = [];
    const firstDow = new Date(year, month-1, 1).getDay();
    const empty0   = firstDow === 0 ? 0 : firstDow === 6 ? 0 : firstDow - 1;
    for (let i = 0; i < empty0 && i < 5; i++) week.push(null);
    for (let date = 1; date <= daysInMonth; date++) {
      const dow = new Date(year, month-1, date).getDay();
      if (dow === 0 || dow === 6) continue;
      week.push({ date, data: dayMap[date] || null });
      if (week.length === 5) { weeks.push(week); week = []; }
    }
    if (week.length) { while (week.length < 5) week.push(null); weeks.push(week); }

    const numWeeks = weeks.length;
    const rowH     = MO_GRID_H / numWeeks;

    // ── Header ──
    drawText(doc, monthName, MO_ML, MO_TITLE_Y, { size:13, bold:true, color:CLR.black });
    hline(doc, MO_ML, MO_W - MO_MR, MO_HLINE_Y, CLR.faint, 0.3);

    // ── Weekday labels ──
    ['Mon','Tue','Wed','Thu','Fri'].forEach((d, i) => {
      drawText(doc, d, MO_ML + i * MO_COL_W + 2, MO_WDAY_Y,
        { size:7.5, bold:true, color:'#888888' });
    });
    hline(doc, MO_ML, MO_W - MO_MR, MO_GRID_Y0, '#999999', 0.4);

    // ── Cell backgrounds (first pass) ──
    weeks.forEach((wk, ri) => {
      const rowY = MO_GRID_Y0 + ri * rowH;
      wk.forEach((cell, ci) => {
        const cx = MO_ML + ci * MO_COL_W;
        if (!cell) {
          fillRect(doc, cx, rowY, MO_COL_W, rowH, CLR.emptyCell, null);
        } else {
          const cycle = cell.data?.cycle || null;
          const isSpecial = cycle && SPECIAL_CYCLES.includes(cycle);
          if (!cycle) fillRect(doc, cx, rowY, MO_COL_W, rowH, CLR.emptyCell, null);
          else if (isSpecial) fillRect(doc, cx, rowY, MO_COL_W, rowH, CLR.specialCell, null);
        }
      });
    });

    // ── Grid lines (second pass, drawn over backgrounds) ──
    doc.setLineWidth(0.22);
    doc.setDrawColor(CLR.faint);
    for (let c = 0; c <= 5; c++) {
      const x = MO_ML + c * MO_COL_W;
      doc.line(x, MO_GRID_Y0, x, MO_GRID_Y1);
    }
    for (let r = 0; r <= numWeeks; r++) {
      const y = MO_GRID_Y0 + r * rowH;
      doc.line(MO_ML, y, MO_W - MO_MR, y);
    }

    // ── Cell content (third pass, drawn over lines) ──
    weeks.forEach((wk, ri) => {
      const rowY = MO_GRID_Y0 + ri * rowH;
      wk.forEach((cell, ci) => {
        if (!cell) return;
        const cx   = MO_ML + ci * MO_COL_W;
        const { date, data } = cell;
        const cycle    = data?.cycle || null;
        const note     = data?.note  || '';
        const dateKey  = `${year}-${String(month).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
        const ovEvs    = (overlay || {})[dateKey] || [];
        const pad      = 2;
        const iw       = MO_COL_W - pad * 2;

        if (!cycle) {
          // no-school/gap
          drawText(doc, String(date), cx + pad, rowY + 4.5,
            { size:9, bold:true, color:CLR.light });
          return;
        }

        let curY = rowY + pad;
        const isSpecial = SPECIAL_CYCLES.includes(cycle);

        // Date number
        drawText(doc, String(date), cx + pad, curY + 4,
          { size:10, bold:true, color:CLR.black });

        if (isSpecial) {
          // Special tag badge below date
          curY += 7;
          const tagW = getTextW(doc, cycle, 6.5, true) + 3;
          fillRoundRect(doc, cx + pad, curY - 2.2, tagW, 3.8, 0.5,
            CLR.spTagBg, CLR.spTagBorder);
          drawText(doc, cycle, cx + pad + 1.5, curY + 1.2,
            { size:6.5, bold:true, color:CLR.spTagText });
          curY += 4;
        } else {
          // Cycle badge (top-right)
          const cycW = getTextW(doc, cycle, 7, true) + 3;
          fillRoundRect(doc, cx + MO_COL_W - pad - cycW, rowY + 1, cycW, 3.8, 0.5,
            CLR.cycleBg, CLR.cycleBorder);
          drawText(doc, cycle, cx + MO_COL_W - pad - cycW + 1.5, rowY + 3.8,
            { size:7, bold:true, color:CLR.cycleText });
          curY += 5.5;
        }

        // Note (max 2 lines)
        if (note) {
          const noteLines = wrapText(doc, note, iw, 2, 7, false);
          noteLines.forEach(ln => {
            drawText(doc, ln, cx + pad, curY, { size:7, color:CLR.noteText });
            curY += 2.5;
          });
          curY += 0.5;
        }

        // Overlay events
        if (ovEvs.length > 0) {
          const first = truncate(doc, ovEvs[0].title,
            iw - (ovEvs.length > 1 ? 7 : 0), 6.5, false);
          const more = ovEvs.length > 1 ? ` +${ovEvs.length - 1}` : '';
          drawText(doc, first + more, cx + pad, curY,
            { size:6.5, color:CLR.overlayText });
          curY += 2.5;
        }

        // Block chips (near bottom of cell)
        if (!isSpecial) {
          const periods  = getPeriodsForDay(cycle, modelId, teacherBlocks, assignments, rooms || {}, catMap, selClasses);
          const chipsBot = rowY + rowH - 1.5;
          const chipH    = 3.2;
          const chipsTop = chipsBot - chipH;
          if (periods.length > 0 && chipsTop > curY) {
            const totalGap = 0.4 * (periods.length - 1);
            const chipW    = (iw - totalGap) / periods.length;
            periods.forEach((code, pi) => {
              const col  = blockColors(code, cycle, selClasses, catMap, dutyMode, teacherBlocks, assignments, rooms || {}, modelId);
              const chX  = cx + pad + pi * (chipW + 0.4);
              fillRoundRect(doc, chX, chipsTop, chipW, chipH, 0.4,
                col.bg, col.border);
              const slot  = getSlotLabel(getSlotFromCode(code), 'compact');
              const slotW = getTextW(doc, slot, 5.5, true);
              drawText(doc, slot, chX + (chipW - slotW) / 2, chipsTop + chipH - 0.7,
                { size:5.5, bold:true, color:col.text });
            });
          }
        }
      });
    });
  }

  // ── Daily list week page ───────────────────────────────────────────────────

  function drawWeekPage(doc, weekLabel, weekDays, selClasses, assignments, catMap, rooms, dutyMode, overlay, teacherBlocks, modelId) {
    const numDays = weekDays.length;
    const dayH    = Math.min(DL_DAYS_H / numDays, DL_DAY_MAX);

    // ── Week header ──
    drawText(doc, weekLabel, DL_ML, DL_HDR_Y, { size:13, bold:true, color:CLR.black });
    hline(doc, DL_ML, DL_W - DL_MR, DL_HLINE_Y, CLR.dark, 0.6);

    weekDays.forEach(({ jsDate, date, data }, di) => {
      const dayY      = DL_DAYS_Y0 + di * dayH;
      const weekday   = jsDate.toLocaleDateString('en-US',{weekday:'long'});
      const monShort  = jsDate.toLocaleDateString('en-US',{month:'short'});
      const cycle     = data?.cycle || null;
      const isSpecial = cycle && SPECIAL_CYCLES.includes(cycle);
      const dateKey   = `${jsDate.getFullYear()}-${String(jsDate.getMonth()+1).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
      const ovEvs     = (overlay || {})[dateKey] || [];

      // Divider between days
      if (di > 0) hline(doc, DL_ML, DL_W - DL_MR, dayY, '#d0d0d0', 0.3);

      let curY = dayY + 5;

      // ── Day header ──
      const labelW = drawText(doc, `${weekday}, ${monShort} ${date}`,
        DL_ML, curY, { size:10.5, bold:true, color:CLR.black });

      // Badge right of label
      const bx = DL_ML + labelW + 3;
      if (cycle && !isSpecial) {
        const bw = getTextW(doc, cycle, 7.5, true) + 3;
        fillRoundRect(doc, bx, curY - 3.2, bw, 4, 0.5, CLR.cycleBg, CLR.cycleBorder);
        drawText(doc, cycle, bx + 1.5, curY, { size:7.5, bold:true, color:CLR.cycleText });
      } else if (isSpecial) {
        const bw = getTextW(doc, cycle, 7.5, true) + 3;
        fillRoundRect(doc, bx, curY - 3.2, bw, 4, 0.5, CLR.spTagBg, CLR.spTagBorder);
        drawText(doc, cycle, bx + 1.5, curY, { size:7.5, bold:true, color:CLR.spTagText });
      } else {
        drawText(doc, 'No school', bx, curY, { size:8, italic:true, color:CLR.noSchool });
      }
      curY += 4;

      // ── Official note ──
      if (data?.note) {
        const noteTxt = truncate(doc, data.note, DL_CW, 7.5, false);
        drawText(doc, noteTxt, DL_ML, curY, { size:7.5, italic:true, color:'#6b7280' });
        curY += 3;
      }

      // ── Overlay calendar events ──
      if (ovEvs.length > 0) {
        const maxShow = Math.min(ovEvs.length, 3);
        const barH    = 2.5 + maxShow * 3 + (ovEvs.length > 3 ? 3 : 0);
        fillRect(doc, DL_ML, curY - 0.5, 1.5, barH, CLR.overlayBar, null);
        drawText(doc, 'CALENDAR', DL_ML + 2.5, curY + 1.2,
          { size:6, bold:true, color:CLR.overlayLbl });
        curY += 3;
        for (let ei = 0; ei < maxShow; ei++) {
          const ev = ovEvs[ei];
          const prefix = ev.startTime ? ev.startTime + '  ' : '';
          const line   = truncate(doc, prefix + ev.title, DL_CW - 4, 8, false);
          drawText(doc, line, DL_ML + 2.5, curY, { size:8, color:CLR.overlayText });
          curY += 3;
        }
        if (ovEvs.length > 3) {
          drawText(doc, `+${ovEvs.length - 3} more`, DL_ML + 2.5, curY,
            { size:7, color:CLR.overlayLbl });
          curY += 3;
        }
        curY += 1;
      }

      // ── Teacher blocks ──
      // Row layout: [period label] [title] [room badge] [block chip]
      if (cycle && !isSpecial) {
        const dayBottom  = dayY + dayH - 1.5;
        const entries    = getScheduleEntriesForDay(cycle, modelId, teacherBlocks, assignments, rooms, catMap, selClasses);
        // Divide remaining vertical space evenly; clamp to a readable range.
        const blockRowH  = Math.max(4.5, Math.min(8.5, (dayBottom - curY) / entries.length));
        const chipH      = blockRowH * 0.78;
        const chipTop0   = blockRowH * 0.11; // offset from row top to chip top
        const textOff    = blockRowH * 0.68; // offset from row top to text baseline

        // Fixed column widths
        const periodColW = 13; // mm — "1st"…"5th"/"FX/SB" text column
        const blockW = 18; // fixed width sized for D-FXSB

        entries.forEach((entry) => {
          const code = entry.blockCode;
          if (curY + blockRowH > dayBottom + 0.5) return;

          const rowTop    = curY;
          const textY     = rowTop + textOff;
          const chipTopY  = rowTop + chipTop0;
          const slot      = getSlotFromCode(code);
          const periodLbl = getPdfPeriodLabel(entry);
          const blocks    = getAssignmentsForBlock(code, cycle, teacherBlocks, assignments, rooms, catMap, selClasses, modelId);
          const assigned  = hasSelectedBlock(selClasses, code, modelId);
          const col       = blockColors(code, cycle, selClasses, catMap, dutyMode, teacherBlocks, assignments, rooms, modelId);
          const title     = blocks.map(block => block.title).filter(Boolean).join(' / ');
          const roomSet   = Array.from(new Set(blocks.map(block => block.room).filter(Boolean)));
          const room      = roomSet.length === 1 ? roomSet[0] : '';
          const blockLbl  = getPdfBlockBadgeLabel(code);

          // Period label — left edge
          drawText(doc, periodLbl, DL_ML, textY,
            { size:7.5, color: assigned ? CLR.dark : CLR.light });

          const contentX = DL_ML + periodColW + 2;

          // Block chip — far right
          const bLblW  = getTextW(doc, blockLbl, 7, true);
          const blockX = DL_W - DL_MR - blockW;
          fillRoundRect(doc, blockX, chipTopY, blockW, chipH, 0.5, col.bg, col.border);
          drawText(doc, blockLbl, blockX + (blockW - bLblW) / 2, textY,
            { size:7, bold:true, color:col.text });

          // Room badge — left of block chip
          let roomBadgeW = 0;
          if (room) {
            const rTextW = getTextW(doc, room, 7, false);
            roomBadgeW   = rTextW + 4;
            const rx     = blockX - 2 - roomBadgeW;
            fillRoundRect(doc, rx, chipTopY, roomBadgeW, chipH, 0.4,
              CLR.roomBg, CLR.roomBorder);
            drawText(doc, room, rx + (roomBadgeW - rTextW) / 2, textY,
              { size:7, color:CLR.roomText });
          }

          // Title — fills space between period column and room/block right side
          const titleMaxX = blockX - (room ? roomBadgeW + 2 : 0) - 2;
          const titleMaxW = titleMaxX - contentX;
          if (title) {
            const tDisp = truncate(doc, title, titleMaxW, 8, true);
            drawText(doc, tDisp, contentX, textY, { size:8, bold:true, color:CLR.black });
          } else {
            drawText(doc, '—', contentX, textY, { size:8, color:CLR.faint });
          }

          curY += blockRowH;
        });
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async function generateMonthlyOverviewPDF(calendarData, selClasses, assignments, catMap, rooms, dutyMode, overlay, teacherBlocks, modelId) {
    const { jsPDF } = window.jspdf;
    const months = Object.keys(calendarData).sort();
    if (!months.length) return false;

    const doc = new jsPDF('landscape', 'mm', 'a4');
    months.forEach((mk, i) => {
      if (i > 0) doc.addPage('a4', 'landscape');
      drawMonthlyPage(doc, mk, calendarData[mk] || [], selClasses, assignments, catMap, dutyMode, overlay, teacherBlocks || [], modelId || DEFAULT_SCHEDULE_BLOCK_MODEL, rooms || {});
    });
    doc.save('my-schedule-monthly-overview.pdf');
    return true;
  }

  async function generateDailyListPDF(calendarData, selClasses, assignments, catMap, rooms, dutyMode, overlay, teacherBlocks, modelId) {
    const { jsPDF } = window.jspdf;
    const weeks = groupCalendarDaysByWeek(calendarData);
    if (!weeks.length) return false;

    const doc = new jsPDF('portrait', 'mm', 'a4');
    weeks.forEach(({ days }, i) => {
      if (i > 0) doc.addPage('a4', 'portrait');
      drawWeekPage(doc, formatWeekLabel(days), days, selClasses, assignments, catMap, rooms, dutyMode, overlay, teacherBlocks || [], modelId || DEFAULT_SCHEDULE_BLOCK_MODEL);
    });
    doc.save('my-schedule-daily-list.pdf');
    return true;
  }

  window.PdfExport = { generateMonthlyOverviewPDF, generateDailyListPDF };
})();
