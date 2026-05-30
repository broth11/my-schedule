if (window.pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      // Panel open/close
      function openPanel() {
          document.getElementById('overlay').classList.add('open');
          document.getElementById('panel').classList.add('open');
      }
      function closePanel() {
          document.getElementById('overlay').classList.remove('open');
          document.getElementById('panel').classList.remove('open');
      }

      const BUILT_IN_CALENDAR_URL = 'data/school-years/2025-2026.json';
      let defaultCalendarData = {};
      let calendarLoadError = null;

      // ICS Calendar Import Functionality
      let importedCalendarData = {};
      let useImportedData = false;
      let scheduleAssignments = {};

      const {
          DAY_LETTERS,
          buildBlockCode,
          parseTeacherScheduleText
      } = window.TeacherScheduleParser;
      const {
          loadTeacherScheduleSettings,
          saveTeacherScheduleSettings,
          loadImportedCalendarState,
          saveImportedCalendarState,
          clearImportedCalendarState,
          loadDateRange,
          saveDateRange: saveStoredDateRange,
          clearDateRange: clearStoredDateRange,
          migrateStoredStateIfNeeded
      } = window.LocalStorageStore;
      const DAY_BLOCK_ORDER = ['1', '2', '3', '4', 'FX', 'ELB', '5'];

      function getSlotFromCode(code) {
          if (!code) return '';
          return code.includes('-') ? code.split('-')[1] : code.slice(1);
      }

      function getDayLetterFromCycle(cycleCode) {
          if (!cycleCode || typeof cycleCode !== 'string') return null;
          const dayLetter = cycleCode.trim().charAt(0).toUpperCase();
          return DAY_LETTERS.includes(dayLetter) ? dayLetter : null;
      }

      function formatGridLabel(code) {
          return code.replace('-ELB', ' ELB');
      }

      function formatInlinePeriodLabel(code) {
          return getSlotFromCode(code);
      }

      function isLongInlineLabel(code) {
          return false;
      }

      function sanitizeHexColor(value, fallback) {
          const raw = (value || '').trim();
          const cleaned = raw.startsWith('#') ? raw.slice(1) : raw;
          if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
          if (/^[0-9a-fA-F]{3}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
          return fallback;
      }

      function refreshColorSwatches() {
          const fixedColors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1'];

          document.querySelectorAll('.color-swatch').forEach(button => {
              const target = button.dataset.target;
              const input = document.getElementById(target);
              const current = (input?.value || '').toLowerCase();

              if (button.dataset.custom === 'true') {
                  button.style.background = current;
                  button.classList.toggle('active', !fixedColors.includes(current));
              } else {
                  const color = (button.dataset.color || '').toLowerCase();
                  button.classList.toggle('active', current === color);
              }
          });
      }

      function setColorValue(inputId, color) {
          const input = document.getElementById(inputId);
          if (!input) return;
          input.value = color;
          updateColors();
      }

      function syncColorInput(inputId) {
          const input = document.getElementById(inputId);
          if (!input) return;
          const fallback = inputId === 'teachingColor' ? '#10b981' : '#e5e7eb';
          input.value = sanitizeHexColor(input.value, fallback);
          updateColors();
      }

      function getBlockTooltip(code) {
          const assignment = scheduleAssignments[code];
          return assignment ? `${code} • ${assignment}` : code;
      }

      function isValidCalendarData(data) {
          return data && typeof data === 'object' && !Array.isArray(data) &&
              Object.entries(data).every(([monthKey, days]) => (
                  /^\d{4}-\d{2}$/.test(monthKey) &&
                  Array.isArray(days) &&
                  days.every(day => (
                      day &&
                      typeof day === 'object' &&
                      Number.isInteger(day.date) &&
                      typeof day.day === 'string' &&
                      typeof day.cycle === 'string'
                  ))
              ));
      }

      async function loadBuiltInCalendarData() {
          try {
              const response = await fetch(BUILT_IN_CALENDAR_URL);
              if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
              }

              const data = await response.json();
              if (!isValidCalendarData(data)) {
                  throw new Error('Invalid calendar data shape');
              }

              defaultCalendarData = data;
              calendarLoadError = null;
          } catch (error) {
              console.error('Could not load built-in school-year calendar data:', error);
              defaultCalendarData = {};
              calendarLoadError = error;
          }
      }

      async function extractTextFromPDF(arrayBuffer) {
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let fullText = '';

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const content = await page.getTextContent();
              const pageText = content.items.map(item => item.str).join(' ');
              fullText += ` ${pageText}`;
          }

          return fullText;
      }

      async function handleTeacherScheduleUpload(event) {
          const file = event.target.files?.[0];
          if (!file) return;

          showToast(`<i class="fa-solid fa-spinner fa-spin"></i> Processing teacher schedule: ${file.name}`, 'success');

          try {
              const arrayBuffer = await file.arrayBuffer();
              const rawText = await extractTextFromPDF(arrayBuffer);
              const parsed = parseTeacherScheduleText(rawText);

              selectedClasses = new Set(parsed.selectedCodes);
              scheduleAssignments = parsed.assignments;
              saveSettings();
              createClassGrid();
              updateCalendar();

              const planningNote = parsed.ignoredPlanningBlocks
                  ? ` Ignored ${parsed.ignoredPlanningBlocks} planning block${parsed.ignoredPlanningBlocks === 1 ? '' : 's'}.`
                  : '';
              showToast(`<i class="fa-regular fa-circle-check"></i> Imported ${parsed.selectedCodes.length} scheduled block obligations from ${parsed.expressionCount} PDF expressions.${planningNote}`, 'success');
          } catch (error) {
              console.error('Error parsing teacher schedule PDF:', error);
              showToast(`<i class="fa-regular fa-circle-xmark"></i> Teacher schedule import failed: ${error.message}`, 'error');
          }

          event.target.value = '';
      }

      function clearImportedSchedule() {
          selectedClasses = new Set();
          scheduleAssignments = {};
          saveSettings();
          createClassGrid();
          updateCalendar();
          showToast('Cleared teacher blocks');
      }

      // Handle ICS file upload (supports multiple files)
      let toastTimeout = null;

      function showToast(message, type = 'success') {
          const toast = document.getElementById('uploadStatus');
          if (!toast) return;
          toast.className = `toast ${type}`;
          toast.innerHTML = message;
          requestAnimationFrame(() => toast.classList.add('show'));

          if (toastTimeout) clearTimeout(toastTimeout);
          toastTimeout = setTimeout(() => {
              toast.classList.remove('show');
          }, 3600);
      }

      function mergeCalendarDataObjects(baseData, incomingData) {
          const mergedMap = new Map();

          function pushDay(monthKey, dayObj) {
              const dayKey = `${monthKey}-${String(dayObj.date).padStart(2, '0')}`;
              if (!mergedMap.has(dayKey)) {
                  mergedMap.set(dayKey, { ...dayObj });
                  return;
              }

              const existing = mergedMap.get(dayKey);
              const notes = [existing.note, dayObj.note].filter(Boolean).join('; ');
              mergedMap.set(dayKey, {
                  ...existing,
                  ...dayObj,
                  cycle: dayObj.cycle || existing.cycle,
                  note: notes || undefined
              });
          }

          [baseData || {}, incomingData || {}].forEach(source => {
              Object.entries(source).forEach(([monthKey, days]) => {
                  days.forEach(dayObj => pushDay(monthKey, dayObj));
              });
          });

          const result = {};
          Array.from(mergedMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .forEach(([dayKey, dayObj]) => {
                  const monthKey = dayKey.slice(0, 7);
                  if (!result[monthKey]) result[monthKey] = [];
                  result[monthKey].push(dayObj);
              });

          Object.keys(result).forEach(monthKey => {
              result[monthKey].sort((a, b) => a.date - b.date);
          });

          return result;
      }

      async function handleICSUpload(event) {
          const files = event.target.files;
          if (!files || files.length === 0) return;

          showToast(`<i class="fa-solid fa-spinner fa-spin"></i> Processing ${files.length} calendar file${files.length === 1 ? '' : 's'}...`, 'success');

          try {
              // Parse all ICS files and merge
              const allEvents = [];

              for (let file of files) {
                  const text = await file.text();
                  const events = parseICS(text);
                  allEvents.push(...events);
                  console.log(`Parsed ${events.length} events from ${file.name}`);
              }

              // Merge all events by date, preserving any previously imported calendars
              const newCalendarData = mergeEventsIntoCalendar(allEvents);
              importedCalendarData = mergeCalendarDataObjects(
                  useImportedData ? importedCalendarData : {},
                  newCalendarData
              );

              useImportedData = true;
              saveImportedCalendarState({ importedCalendarData, useImportedData });

              // Reset to first available month in the imported data
              const availableMonths = Object.keys(getFilteredCalendarData()).sort();
              if (availableMonths.length > 0) {
                  currentMonth = availableMonths[0];
              }

              // Update the calendar display
              updateCalendar();

              showToast(`<i class="fa-regular fa-circle-check"></i> Imported ${allEvents.length} calendar event${allEvents.length === 1 ? '' : 's'} from ${files.length} ICS file${files.length === 1 ? '' : 's'}.`, 'success');

          } catch (error) {
              console.error('Error parsing ICS:', error);
              showToast(`<i class="fa-regular fa-circle-xmark"></i> Calendar import failed: ${error.message}`, 'error');
          }

          // Reset file input
          event.target.value = '';
      }

      // Parse ICS file and extract events
      function parseICS(icsText) {
          const jcalData = ICAL.parse(icsText);
          const comp = new ICAL.Component(jcalData);
          const vevents = comp.getAllSubcomponents('vevent');

          const events = [];

          vevents.forEach(vevent => {
              const event = new ICAL.Event(vevent);
              const summary = event.summary || '';
              const startDate = event.startDate;
              const endDate = event.endDate;

              if (!startDate) return;

              // For multi-day events, create an entry for each day
              const start = new Date(startDate.year, startDate.month - 1, startDate.day);

              // If there's an end date and it's different from start, expand the event
              if (endDate) {
                  const end = new Date(endDate.year, endDate.month - 1, endDate.day);

                  // For all-day events, end date is exclusive (event ends at midnight before end date)
                  // So we subtract one day from the end
                  end.setDate(end.getDate() - 1);

                  // Create event for each day in the range
                  const currentDate = new Date(start);
                  while (currentDate <= end) {
                      const year = currentDate.getFullYear();
                      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                      const day = String(currentDate.getDate()).padStart(2, '0');
                      const dateKey = `${year}-${month}-${day}`;

                      events.push({
                          date: dateKey,
                          summary: summary,
                          description: event.description || ''
                      });

                      currentDate.setDate(currentDate.getDate() + 1);
                  }
              } else {
                  // Single day event
                  const year = startDate.year;
                  const month = String(startDate.month).padStart(2, '0');
                  const day = String(startDate.day).padStart(2, '0');
                  const dateKey = `${year}-${month}-${day}`;

                  events.push({
                      date: dateKey,
                      summary: summary,
                      description: event.description || ''
                  });
              }
          });

          return events;
      }

      // Merge events into calendar structure
      function mergeEventsIntoCalendar(events) {
          const merged = {};

          // Group events by date
          const eventsByDate = {};
          events.forEach(event => {
              if (!eventsByDate[event.date]) {
                  eventsByDate[event.date] = [];
              }
              eventsByDate[event.date].push(event);
          });

          // Process each date
          Object.keys(eventsByDate).forEach(dateKey => {
              const [year, month, day] = dateKey.split('-');
              const monthKey = `${year}-${month}`;

              if (!merged[monthKey]) {
                  merged[monthKey] = [];
              }

              const dateEvents = eventsByDate[dateKey];

              // Extract cycle code from events
              let cycleCode = null;
              let notes = [];

              dateEvents.forEach(event => {
                  const summary = event.summary;

                  // Look for cycle day pattern (Day A-1, Day B-2, etc.)
                  const cycleMatch = summary.match(/Day\s+([A-D])-?([1-5])/i);
                  if (cycleMatch) {
                      cycleCode = `${cycleMatch[1]}${cycleMatch[2]}`;
                  }

                  // Check for special day types
                  if (summary.match(/holiday|break/i) && !cycleCode) {
                      cycleCode = 'HOLIDAY';
                  } else if (summary.match(/in-service/i) && !cycleCode) {
                      cycleCode = 'IN-SERVICE';
                  } else if (summary.match(/songkran/i) && !cycleCode) {
                      cycleCode = 'SONGKRAN';
                  } else if (summary.match(/PTC/i) && summary.match(/no.*student/i)) {
                      cycleCode = 'PTC';
                  }

                  // Collect all non-cycle-day events as notes
                  if (!summary.match(/Day\s+[A-D]-?[1-5]/i)) {
                      notes.push(summary);
                  }
              });

              // Create the day object
              const dayOfWeek = new Date(dateKey).toLocaleDateString('en-US', { weekday: 'short' });
              const dayObj = {
                  date: parseInt(day),
                  day: dayOfWeek.substring(0, 3),
                  cycle: cycleCode
              };

              if (notes.length > 0) {
                  dayObj.note = notes.join('; ');
              }

              merged[monthKey].push(dayObj);
          });

          // Sort each month by date
          Object.keys(merged).forEach(monthKey => {
              merged[monthKey].sort((a, b) => a.date - b.date);
          });

          return merged;
      }

      // Clear imported calendar data
      function clearImportedCalendar() {
          if (confirm('Clear all imported calendar data and return to default calendar?')) {
              importedCalendarData = {};
              useImportedData = false;
              clearImportedCalendarState();
              showToast('Cleared imported calendar');

              const availableMonths = Object.keys(getFilteredCalendarData()).sort();
              if (availableMonths.length > 0) {
                  currentMonth = availableMonths[0];
              }

              updateCalendar();
          }
      }

      // Get active calendar data (imported or built-in)
      function getActiveCalendarData() {
          if (useImportedData && Object.keys(importedCalendarData).length > 0) {
              return importedCalendarData;
          }
          return defaultCalendarData;
      }

      // Date range filtering
      let dateRangeStart = null;
      let dateRangeEnd = null;

      function setDateRange() {
          const startInput = document.getElementById('dateRangeStart').value;
          const endInput = document.getElementById('dateRangeEnd').value;

          if (startInput) {
              // Convert YYYY-MM-DD to YYYY-MM for month comparison
              dateRangeStart = startInput.substring(0, 7);
          } else {
              dateRangeStart = null;
          }

          if (endInput) {
              dateRangeEnd = endInput.substring(0, 7);
          } else {
              dateRangeEnd = null;
          }

          saveStoredDateRange({ startDate: startInput, endDate: endInput });

          // Reset to first available month in the new range
          const availableMonths = Object.keys(getFilteredCalendarData()).sort();
          if (availableMonths.length > 0) {
              currentMonth = availableMonths[0];
          }

          updateCalendar();
      }

      function clearDateRange() {
          dateRangeStart = null;
          dateRangeEnd = null;
          document.getElementById('dateRangeStart').value = '';
          document.getElementById('dateRangeEnd').value = '';
          clearStoredDateRange();

          // Reset to first available month after clearing range
          const availableMonths = Object.keys(getFilteredCalendarData()).sort();
          if (availableMonths.length > 0) {
              currentMonth = availableMonths[0];
          }

          updateCalendar();
      }

      function getFilteredCalendarData() {
          const data = getActiveCalendarData();

          if (!dateRangeStart && !dateRangeEnd) {
              return data;
          }

          const filtered = {};

          // Get all month keys and sort them chronologically
          const sortedMonths = Object.keys(data).sort();

          sortedMonths.forEach(monthKey => {
              // Check if this month is within range
              if (dateRangeStart && monthKey < dateRangeStart) {
                  return; // Skip months before start
              }
              if (dateRangeEnd && monthKey > dateRangeEnd) {
                  return; // Skip months after end
              }

              filtered[monthKey] = data[monthKey];
          });

          return filtered;
      }

      // State
      let selectedClasses = new Set();
      let currentView = 'monthly';
      let currentMonth = '2026-01';
      let currentWeekStart = null;

      // Initialize
      document.addEventListener('DOMContentLoaded', async () => {
          loadSettings();
          createClassGrid();

          // Panel buttons
          document.getElementById('openBtn').onclick = openPanel;
          document.getElementById('closeBtn').onclick = closePanel;
          document.getElementById('overlay').onclick = closePanel;
          document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

          // "Show only my periods" toggle
          document.getElementById('onlyMine').addEventListener('change', e => {
              document.body.classList.toggle('only-mine', e.target.checked);
          });

          await loadBuiltInCalendarData();

          const availableMonths = Object.keys(getFilteredCalendarData()).sort();
          if (availableMonths.length > 0) {
              currentMonth = availableMonths[0];
          }

          // Open settings panel by default on first load
          openPanel();

          updateCalendar();
      });

      // Create class selection grid
      function createClassGrid() {
          const grid = document.getElementById('classGrid');
          grid.innerHTML = '';

          DAY_LETTERS.forEach(letter => {
              DAY_BLOCK_ORDER.forEach(slot => {
                  const code = buildBlockCode(letter, slot);
                  const btn = document.createElement('button');
                  btn.className = 'class-btn' + (selectedClasses.has(code) ? ' sel' : '');
                  btn.textContent = formatGridLabel(code);
                  btn.dataset.code = code;
                  btn.onclick = () => toggleClass(code);
                  grid.appendChild(btn);
              });
          });
          updateCount();
      }

      function updateCount() {
          const el = document.getElementById('countLine');
          if (el) el.innerHTML = `<b>${selectedClasses.size}</b> ${selectedClasses.size === 1 ? 'class' : 'classes'} selected`;
      }

      // Toggle class selection
      function toggleClass(code) {
          if (selectedClasses.has(code)) {
              selectedClasses.delete(code);
          } else {
              selectedClasses.add(code);
          }
          const btn = document.querySelector(`#classGrid .class-btn[data-code="${CSS.escape(code)}"]`);
          if (btn) btn.classList.toggle('sel', selectedClasses.has(code));
          updateCount();
          saveSettings();
          updateCalendar();
      }

      const NUMERIC_SLOTS = ['1','2','3','4','5'];

      // Get block units for a cycle day.
      // FX and ELB are always fixed between p4 and p5; only the numeric slots rotate.
      // e.g. B2 → B2, B3, B4, B5, B-FX, B-ELB, B1
      function getPeriodsForDay(cycleCode) {
          const letter = getDayLetterFromCycle(cycleCode);
          if (!letter) return [];

          const startSlot = cycleCode.slice(letter.length);
          const startIndex = NUMERIC_SLOTS.indexOf(startSlot);

          const nums = startIndex > 0
              ? [...NUMERIC_SLOTS.slice(startIndex), ...NUMERIC_SLOTS.slice(0, startIndex)]
              : [...NUMERIC_SLOTS];

          // Physical order: p1, p2, p3, p4, FX, ELB, p5
          const ordered = [nums[0], nums[1], nums[2], nums[3], 'FX', 'ELB', nums[4]];
          return ordered.map(slot => buildBlockCode(letter, slot));
      }

      // Update calendar view
      function updateCalendar() {
          const calendarView = document.getElementById('calendarView');
          const filteredData = getFilteredCalendarData();

          // Check if calendar is empty
          if (Object.keys(filteredData).length === 0) {
              if (calendarLoadError && !(useImportedData && Object.keys(importedCalendarData).length > 0)) {
                  calendarView.innerHTML = `
                    <div class="empty-state">
                      <h2>Calendar Data Unavailable</h2>
                      <p>Could not load built-in school-year calendar data.<br>Check data/school-years/2025-2026.json or upload an ICS calendar.</p>
                      <button class="btn primary" onclick="document.getElementById('icsUpload').click()">Upload ICS Calendar</button>
                    </div>
                  `;
                  return;
              }

              calendarView.innerHTML = `
                <div class="empty-state">
                  <h2>No Calendar Data</h2>
                  <p>Upload your ICS calendar files to get started, or your teacher schedule PDF to auto-fill the teaching blocks.</p>
                  <button class="btn primary" onclick="document.getElementById('icsUpload').click()">Upload ICS Calendar</button>
                </div>
              `;
              return;
          }

          if (currentView === 'monthly') {
              calendarView.innerHTML = renderMonthlyView();
          } else {
              calendarView.innerHTML = renderWeeklyView();
          }
      }

      const SPECIAL_CYCLES = ['HOLIDAY', 'IN-SERVICE', 'PTC', 'SONGKRAN', 'NO-SCHOOL'];
      const NEUTRAL_CYCLES = ['IN-SERVICE', 'PTC'];

      // Render monthly view
      function renderMonthlyView() {
          const [year, month] = currentMonth.split('-');
          const monthName = new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long' });
          const days = getFilteredCalendarData()[currentMonth] || [];
          const today = new Date();
          const daysInMonth = new Date(year, parseInt(month), 0).getDate();

          let html = `
            <section class="card">
              <div class="month-bar">
                <h2 class="month-title">${monthName} <span class="month-year">${year}</span></h2>
                <div class="nav">
                  <button onclick="prevMonth()">← Previous</button>
                  <button onclick="nextMonth()">Next →</button>
                </div>
              </div>
              <div class="legend">
                <div class="grp"><span class="swatch-on">1</span> You teach</div>
                <div class="grp"><span class="swatch-off">1</span> No class</div>
                <span class="sep">·</span>
                <div class="grp"><span class="abbr">FX</span> Flex period</div>
                <div class="grp"><span class="abbr">ELB</span> Extended Learning Block</div>
              </div>
              <div class="weekdays">
                <div class="weekday">Monday</div>
                <div class="weekday">Tuesday</div>
                <div class="weekday">Wednesday</div>
                <div class="weekday">Thursday</div>
                <div class="weekday">Friday</div>
              </div>
              <div class="grid">
          `;

          const firstDay = new Date(year, parseInt(month) - 1, 1).getDay();
          const adjustedFirstDay = firstDay === 0 ? 5 : (firstDay === 6 ? 5 : firstDay - 1);
          if (adjustedFirstDay > 0 && adjustedFirstDay < 5) {
              for (let i = 0; i < adjustedFirstDay; i++) {
                  html += '<div class="day empty"></div>';
              }
          }

          const dayMap = {};
          days.forEach(d => { dayMap[d.date] = d; });

          for (let date = 1; date <= daysInMonth; date++) {
              const dow = new Date(year, parseInt(month) - 1, date).getDay();
              if (dow === 0 || dow === 6) continue;

              const dayData = dayMap[date];
              const isToday = today.getFullYear() == year &&
                              today.getMonth() + 1 == parseInt(month) &&
                              today.getDate() == date;
              const todayClass = isToday ? ' today' : '';

              if (!dayData) {
                  html += `<div class="day empty${todayClass}"></div>`;
                  continue;
              }

              const cycle = dayData.cycle;

              if (!cycle) {
                  html += `<div class="day${todayClass}">
                    <div class="day-top"><span class="day-num">${date}</span></div>
                    <div class="day-rest">No school</div>
                    ${renderPeriods(null)}
                  </div>`;
                  continue;
              }

              if (SPECIAL_CYCLES.includes(cycle)) {
                  const neutral = NEUTRAL_CYCLES.includes(cycle) ? ' neutral' : '';
                  html += `<div class="day special${neutral}${todayClass}">
                    <div class="day-top"><span class="day-num">${date}</span></div>
                    <span class="tag">${cycle}</span>
                    ${dayData.note ? `<div class="day-note">${dayData.note}</div>` : ''}
                    ${renderPeriods(cycle)}
                  </div>`;
                  continue;
              }

              // Teaching day
              html += `<div class="day${todayClass}">
                <div class="day-top">
                  <span class="day-num">${date}</span>
                  <span class="cycle">${cycle}</span>
                </div>
                ${dayData.note ? `<div class="day-note">${dayData.note}</div>` : ''}
                ${renderPeriods(cycle)}
              </div>`;
          }

          html += `</div></section>`;
          return html;
      }

      // Render daily view
      function renderWeeklyView() {
          const days = getFilteredCalendarData()[currentMonth] || [];
          const [year, month] = currentMonth.split('-');
          const monthName = new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long' });
          const today = new Date();
          const daysInMonth = new Date(year, parseInt(month), 0).getDate();

          let html = `
            <section class="card">
              <div class="month-bar">
                <h2 class="month-title">${monthName} <span class="month-year">${year}</span> <span style="font-size:14px;font-weight:500;color:var(--muted)">— Daily</span></h2>
                <div class="nav">
                  <button onclick="prevMonth()">← Previous</button>
                  <button onclick="nextMonth()">Next →</button>
                </div>
              </div>
              <div class="week-view" style="margin-top:20px">
          `;

          const dayMap = {};
          days.forEach(d => { dayMap[d.date] = d; });

          for (let date = 1; date <= daysInMonth; date++) {
              const currentDate = new Date(year, parseInt(month) - 1, date);
              const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
              const dayData = dayMap[date];

              const isToday = today.getFullYear() == year &&
                              today.getMonth() + 1 == parseInt(month) &&
                              today.getDate() == date;

              const dayClass = isToday ? 'week-day current-day' : 'week-day';

              if (dayData) {
                  const periodsHTML = renderPeriodsInline(dayData.cycle);
                  html += `
                    <div class="${dayClass}">
                      <div class="week-day-header">
                        <div>
                          <div class="week-day-title">${dayData.day}, ${monthName} ${dayData.date}</div>
                          <div class="week-day-cycle">${dayData.cycle || 'No school'}</div>
                        </div>
                        <div class="week-periods">${periodsHTML}</div>
                      </div>
                      ${dayData.note ? `<div style="font-size:13px;color:var(--ink-2);margin-top:8px">${dayData.note}</div>` : ''}
                    </div>
                  `;
              } else {
                  html += `
                    <div class="${dayClass}">
                      <div class="week-day-header">
                        <div>
                          <div class="week-day-title">${dayOfWeek}, ${monthName} ${date}</div>
                          <div class="week-day-cycle"></div>
                        </div>
                      </div>
                    </div>
                  `;
              }
          }

          html += `</div></section>`;
          return html;
      }

      // Render periods inline (just dots, no labels)
      function renderPeriodsInline(cycleCode) {
          if (!cycleCode || cycleCode === 'HOLIDAY' || cycleCode === 'IN-SERVICE' ||
              cycleCode === 'PTC' || cycleCode === 'SONGKRAN') {
              return '';
          }

          const periods = getPeriodsForDay(cycleCode);

          return periods.map(p => {
              const isTeaching = selectedClasses.has(p);
              const displayLabel = formatInlinePeriodLabel(p);
              const extraClass = isLongInlineLabel(p) ? ' long-label' : '';
              return `<div class="period-dot ${isTeaching ? 'teaching' : 'free'}${extraClass}" title="${getBlockTooltip(p)}">${displayLabel}</div>`;
          }).join('');
      }

      // Helper function to format period labels
      function formatPeriodLabel(period) {
          return getSlotFromCode(period);
      }

      // Render periods as segmented strip.
      // Non-teaching days get the standard slot order, all hollow.
      function renderPeriods(cycleCode) {
          const isSpecial = !cycleCode || SPECIAL_CYCLES.includes(cycleCode);

          let pills;
          let teachCount = 0;

          if (isSpecial) {
              pills = DAY_BLOCK_ORDER.map(slot => `<div class="pill">${slot}</div>`).join('');
          } else {
              const periods = getPeriodsForDay(cycleCode);
              teachCount = periods.filter(p => selectedClasses.has(p)).length;
              pills = periods.map(p => {
                  const on = selectedClasses.has(p);
                  const label = getSlotFromCode(p);
                  return `<div class="pill${on ? ' on' : ''}" title="${getBlockTooltip(p)}">${label}</div>`;
              }).join('');
          }

          return `<div class="periods${teachCount === 0 && !isSpecial ? ' none' : ''}">${pills}</div>`;
      }

      // Navigation
      function prevMonth() {
          const months = Object.keys(getFilteredCalendarData()).sort();
          const currentIdx = months.indexOf(currentMonth);
          if (currentIdx > 0) {
              currentMonth = months[currentIdx - 1];
              updateCalendar();
          }
      }

      function nextMonth() {
          const months = Object.keys(getFilteredCalendarData()).sort();
          const currentIdx = months.indexOf(currentMonth);
          if (currentIdx < months.length - 1) {
              currentMonth = months[currentIdx + 1];
              updateCalendar();
          }
      }

      // View toggles
      function refreshDisplayModeButtons() {
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          document.getElementById('monthlyBtn').classList.toggle('active', currentView === 'monthly');
          document.getElementById('weeklyBtn').classList.toggle('active', currentView === 'weekly');
          document.getElementById('lightModeBtn').classList.toggle('active', !isDark);
          document.getElementById('darkModeBtn').classList.toggle('active', isDark);
      }

      function setView(view) {
          currentView = view;
          refreshDisplayModeButtons();

          // Set body class for print orientation
          document.body.className = `view-${view}`;

          // Update print orientation style
          updatePrintOrientation();

          updateCalendar();
      }

      // Update print page orientation based on current view
      function updatePrintOrientation() {
          // Remove existing print orientation style if present
          const existingStyle = document.getElementById('print-orientation-style');
          if (existingStyle) {
              existingStyle.remove();
          }

          // Create new style tag
          const style = document.createElement('style');
          style.id = 'print-orientation-style';

          if (currentView === 'monthly') {
              style.textContent = '@page { size: A4 landscape; }';
          } else {
              style.textContent = '@page { size: A4 portrait; }';
          }

          document.head.appendChild(style);
      }

      // Also update orientation before window print
      window.onbeforeprint = function() {
          updatePrintOrientation();
      };

      function setTheme(theme) {
          const html = document.documentElement;
          if (theme === 'dark') {
              html.setAttribute('data-theme', 'dark');
          } else {
              html.setAttribute('data-theme', '');
          }
          refreshDisplayModeButtons();
          saveSettings();
      }

      // Color customization
      function updateColors() {
          const teachingColor = sanitizeHexColor(document.getElementById('teachingColor').value, '#10b981');
          const freeColor = sanitizeHexColor(document.getElementById('freeColor').value, '#e5e7eb');
          document.getElementById('teachingColor').value = teachingColor;
          document.getElementById('freeColor').value = freeColor;
          document.documentElement.style.setProperty('--teaching-color', teachingColor);
          document.documentElement.style.setProperty('--free-color', freeColor);
          refreshColorSwatches();
          saveSettings();
      }

      // Export to PDF
      async function exportToPDF() {
          const { jsPDF } = window.jspdf;
          const months = Object.keys(getFilteredCalendarData()).sort();

          if (months.length === 0) {
              alert('No calendar data to export! Please upload ICS files first.');
              return;
          }

          const originalView = currentView;

          // Create PDF with appropriate orientation
          const orientation = currentView === 'monthly' ? 'landscape' : 'portrait';
          const pdf = new jsPDF(orientation, 'mm', 'a4');

          for (let i = 0; i < months.length; i++) {
              currentMonth = months[i];
              updateCalendar();

              // Wait for render
              await new Promise(resolve => setTimeout(resolve, 100));

              const element = document.getElementById('calendarView');
              const canvas = await html2canvas(element, {
                  scale: 2.5, // Increased from 1.5 for better quality
                  backgroundColor: '#ffffff',
                  logging: false,
                  useCORS: true
              });

              // Use PNG with good compression for sharper text
              const imgData = canvas.toDataURL('image/png');

              const pdfWidth = orientation === 'landscape' ? 297 : 210;
              const pdfHeight = orientation === 'landscape' ? 210 : 297;

              const imgWidth = pdfWidth - 20; // 10mm margin on each side
              const imgHeight = (canvas.height * imgWidth) / canvas.width;

              if (i > 0) pdf.addPage([pdfWidth, pdfHeight], orientation);

              // Center the image
              const xOffset = 10;
              const yOffset = 10;

              pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, Math.min(imgHeight, pdfHeight - 20));
          }

          pdf.save('teacher-schedule-2026.pdf');

          // Reset to original view and first month
          currentView = originalView;
          currentMonth = months[0];
          updateCalendar();
      }

      // LocalStorage
      function saveSettings() {
          saveTeacherScheduleSettings({
              selectedClasses: Array.from(selectedClasses),
              scheduleAssignments
          });
      }

      function loadSettings() {
          migrateStoredStateIfNeeded();

          const settings = loadTeacherScheduleSettings();
          selectedClasses = new Set(settings.selectedClasses || []);
          scheduleAssignments = settings.scheduleAssignments || {};

          const importedCalendarState = loadImportedCalendarState();
          if (importedCalendarState.useImportedData && Object.keys(importedCalendarState.importedCalendarData).length > 0) {
              importedCalendarData = importedCalendarState.importedCalendarData;
              useImportedData = true;
              showToast('Using imported calendar data');
          }

          const savedDateRange = loadDateRange();
          if (savedDateRange.startDate) {
              dateRangeStart = savedDateRange.startDate.substring(0, 7);
              const el = document.getElementById('dateRangeStart');
              if (el) el.value = savedDateRange.startDate;
          }
          if (savedDateRange.endDate) {
              dateRangeEnd = savedDateRange.endDate.substring(0, 7);
              const el = document.getElementById('dateRangeEnd');
              if (el) el.value = savedDateRange.endDate;
          }
      }
