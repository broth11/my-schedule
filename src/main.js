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

      // Structured overlay events from imported ICS files, keyed by "YYYY-MM-DD".
      // Separate from cycle-day calendar; never overwrites cycle codes.
      let calendarOverlayEventsByDate = {};

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
          loadOverlayEvents,
          saveOverlayEvents,
          clearOverlayEvents,
          loadDateRange,
          saveDateRange: saveStoredDateRange,
          clearDateRange: clearStoredDateRange,
          migrateStoredStateIfNeeded
      } = window.LocalStorageStore;

      const {
          buildOverlayEventsFromICS,
          mergeOverlayEvents,
          filterOverlayToMonths,
      } = window.OverlayHelpers;
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

          showToast('Processing teacher schedule…');

          try {
              const arrayBuffer = await file.arrayBuffer();
              const rawText = await extractTextFromPDF(arrayBuffer);
              const parsed = parseTeacherScheduleText(rawText);
              closePanel();
              showImportPreview(parsed);
          } catch (error) {
              console.error('Error parsing teacher schedule PDF:', error);
              showToast(`Teacher schedule import failed: ${error.message}`, 'error');
          }

          event.target.value = '';
      }

      function clearImportedSchedule() {
          selectedClasses = new Set();
          scheduleAssignments = {};
          scheduleCategories = {};
          scheduleRooms = {};
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

              // Build structured overlay events (separate from cycle-day structure)
              const newOverlay = buildOverlayEventsFromICS(allEvents);
              calendarOverlayEventsByDate = mergeOverlayEvents(calendarOverlayEventsByDate, newOverlay);

              useImportedData = true;
              saveImportedCalendarState({ importedCalendarData, useImportedData });
              saveOverlayEvents(calendarOverlayEventsByDate);

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
                          description: event.description || '',
                          allDay: true,
                          startTime: null,
                          endTime: null,
                      });

                      currentDate.setDate(currentDate.getDate() + 1);
                  }
              } else {
                  // Single day event
                  const year = startDate.year;
                  const month = String(startDate.month).padStart(2, '0');
                  const day = String(startDate.day).padStart(2, '0');
                  const dateKey = `${year}-${month}-${day}`;

                  const isAllDay = Boolean(startDate.isDate);
                  const startTime = isAllDay ? null
                      : `${String(startDate.hour).padStart(2,'0')}:${String(startDate.minute).padStart(2,'0')}`;
                  const endTime = (endDate && !endDate.isDate)
                      ? `${String(endDate.hour).padStart(2,'0')}:${String(endDate.minute).padStart(2,'0')}`
                      : null;

                  events.push({
                      date: dateKey,
                      summary: summary,
                      description: event.description || '',
                      allDay: isAllDay,
                      startTime,
                      endTime,
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
              calendarOverlayEventsByDate = {};
              clearImportedCalendarState();
              clearOverlayEvents();
              showToast('Cleared imported calendar');

              const availableMonths = Object.keys(getFilteredCalendarData()).sort();
              if (availableMonths.length > 0) {
                  currentMonth = availableMonths[0];
              }

              updateCalendar();
          }
      }

      // Get active calendar data.
      // Built-in school-year JSON is always the authoritative cycle-day source.
      // Imported ICS data is merged on top: ICS cycle codes take precedence where
      // provided (for ICS-as-cycle-calendar use), but built-in fills in everywhere
      // the ICS has no cycle info (preserving the school year structure).
      function getActiveCalendarData() {
          if (useImportedData && Object.keys(importedCalendarData).length > 0) {
              return mergeCalendarDataObjects(defaultCalendarData, importedCalendarData);
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
      let selectedClasses    = new Set();
      let scheduleCategories = {};
      let scheduleRooms      = {};
      let dutyColorMode      = 'single';  // 'single' | 'category'
      let scheduleViewMode   = 'auto';    // 'auto' | 'month' | 'list'
      let currentView        = 'monthly'; // derived; kept for PDF export compat
      let expandedListDay    = null;      // date key of the currently-open list row
      let currentMonth = '2026-01';
      let currentWeekStart = null;

      // Initialize
      document.addEventListener('DOMContentLoaded', async () => {
          loadSettings();
          refreshViewControl();
          refreshDutyColorControl();
          createClassGrid();

          // Settings panel
          document.getElementById('openBtn').onclick = openPanel;
          document.getElementById('closeBtn').onclick = closePanel;
          document.getElementById('overlay').onclick = closePanel;

          // Import preview panel
          document.getElementById('previewBackdrop').onclick  = closePreviewPanel;
          document.getElementById('previewCancelBtn').onclick = closePreviewPanel;
          document.getElementById('previewApplyBtn').onclick  = applyImportPreview;

          // Export PDF modal
          document.getElementById('exportPdfBackdrop').onclick = closeExportModal;
          document.getElementById('exportPdfCloseBtn').onclick = closeExportModal;
          document.getElementById('exportPdfCancelBtn').onclick = closeExportModal;
          document.getElementById('exportMonthlyBtn').onclick  = exportMonthlyOverview;
          document.getElementById('exportDailyBtn').onclick    = exportDailyList;

          document.addEventListener('keydown', e => {
              if (e.key === 'Escape') {
                  if (document.getElementById('exportPdfModal').classList.contains('open')) {
                      closeExportModal();
                  } else if (document.getElementById('importPreviewPanel').classList.contains('open')) {
                      closePreviewPanel();
                  } else {
                      closePanel();
                  }
              }
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
          if (!calendarView) return;

          const filteredData = getFilteredCalendarData();

          if (Object.keys(filteredData).length === 0) {
              if (calendarLoadError && !(useImportedData && Object.keys(importedCalendarData).length > 0)) {
                  calendarView.innerHTML = `
                    <div class="empty-state">
                      <h2>Calendar Data Unavailable</h2>
                      <p>Could not load the built-in school-year calendar.<br>
                         Check data/school-years/2025-2026.json or upload an ICS calendar.</p>
                      <button class="btn primary" onclick="document.getElementById('icsUpload').click()">Upload ICS Calendar</button>
                    </div>`;
                  return;
              }
              calendarView.innerHTML = `
                <div class="empty-state">
                  <h2>No Calendar Data</h2>
                  <p>Upload your ICS calendar files to get started, or your teacher schedule PDF to auto-fill the teaching blocks.</p>
                  <button class="btn primary" onclick="document.getElementById('icsUpload').click()">Upload ICS Calendar</button>
                </div>`;
              return;
          }

          const view = getEffectiveScheduleView();
          currentView = view; // keep in sync for PDF export

          if (view === 'monthly') {
              calendarView.innerHTML = renderMonthlyView();
          } else {
              calendarView.innerHTML = renderListView();
          }
      }

      // Re-render when viewport crosses the auto-mode breakpoint.
      (function () {
          let _lastView = null;
          function _onResize() {
              if (scheduleViewMode !== 'auto') return;
              const v = getEffectiveScheduleView();
              if (v !== _lastView) { _lastView = v; updateCalendar(); }
          }
          window.addEventListener('resize', _onResize);
      })();

      const SPECIAL_CYCLES = ['HOLIDAY', 'IN-SERVICE', 'PTC', 'SONGKRAN', 'NO-SCHOOL'];
      const NEUTRAL_CYCLES = ['IN-SERVICE', 'PTC'];

      const CATEGORY_META = [
          { cat: 'teaching',  label: 'Teaching'  },
          { cat: 'homeroom',  label: 'Homeroom'  },
          { cat: 'advisory',  label: 'Advisory'  },
          { cat: 'elb',       label: 'ELB'       },
          { cat: 'planning',  label: 'Planning'  },
          { cat: 'other',     label: 'Other'     }
      ];

      function renderLegend() {
          if (dutyColorMode === 'category') {
              // Only show categories that have at least one assigned block.
              const usedCats = new Set(
                  Array.from(selectedClasses).map(code => getBlockCategory(code) || 'teaching')
              );
              const catSwatches = CATEGORY_META
                  .filter(m => usedCats.has(m.cat))
                  .map(m => `<div class="grp"><span class="swatch-on cat-${m.cat}">${m.cat === 'other' ? '?' : '1'}</span> ${m.label}</div>`)
                  .join('');
              return `<div class="legend">
                  ${catSwatches || '<div class="grp"><span class="swatch-off">1</span> No duties selected</div>'}
                  <div class="grp"><span class="swatch-off">1</span> No class</div>
                  <span class="sep">·</span>
                  <div class="grp"><span class="abbr">FX</span> Flex</div>
                  <div class="grp"><span class="abbr">ELB</span> Ext. Learning</div>
              </div>`;
          }

          return `<div class="legend">
              <div class="grp"><span class="swatch-on">1</span> You teach</div>
              <div class="grp"><span class="swatch-off">1</span> No class</div>
              <span class="sep">·</span>
              <div class="grp"><span class="abbr">FX</span> Flex period</div>
              <div class="grp"><span class="abbr">ELB</span> Extended Learning Block</div>
          </div>`;
      }

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
              ${renderLegend()}
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

      // Render list view — compact expandable rows, works on all screen sizes.
      function renderListView() {
          const days        = getFilteredCalendarData()[currentMonth] || [];
          const [year, month] = currentMonth.split('-');
          const monthName   = new Date(year, parseInt(month) - 1)
              .toLocaleDateString('en-US', { month: 'long' });
          const today       = new Date();
          const daysInMonth = new Date(year, parseInt(month), 0).getDate();

          const dayMap = {};
          days.forEach(d => { dayMap[d.date] = d; });

          let html = `
            <section class="card list-card">
              <div class="month-bar">
                <h2 class="month-title">${monthName} <span class="month-year">${year}</span></h2>
                <div class="nav">
                  <button onclick="prevMonth()">← Previous</button>
                  <button onclick="nextMonth()">Next →</button>
                </div>
              </div>
              <div class="list-view">
          `;

          for (let date = 1; date <= daysInMonth; date++) {
              const jsDate  = new Date(year, parseInt(month) - 1, date);
              const dow     = jsDate.getDay();
              if (dow === 0 || dow === 6) continue; // skip weekends

              const dayData = dayMap[date];
              if (!dayData) continue; // skip calendar gaps

              const dayKey  = `${year}-${String(month).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
              const isToday = today.getFullYear() == year &&
                              today.getMonth() + 1 == parseInt(month) &&
                              today.getDate()   == date;
              const isExp   = expandedListDay === dayKey;
              const cycle   = dayData.cycle;
              const isSpecial = cycle && SPECIAL_CYCLES.includes(cycle);
              const dayLabel  = jsDate.toLocaleDateString('en-US', { weekday: 'short' });

              const rowClasses = [
                  'list-day',
                  isToday   ? 'today'    : '',
                  isExp     ? 'expanded' : '',
                  isSpecial ? 'special'  : '',
                  !cycle    ? 'no-school': ''
              ].filter(Boolean).join(' ');

              // ── Summary row ────────────────────────────────────────────
              let summaryInner = `
                  <div class="list-day-left">
                    <span class="list-day-label">${dayLabel}</span>
                    <span class="list-day-num">${date}</span>
                    ${cycle && !isSpecial ? `<span class="list-cycle">${cycle}</span>` : ''}
                    ${isSpecial           ? `<span class="tag list-tag">${cycle}</span>` : ''}
                    ${!cycle              ? `<span class="list-no-school">No school</span>` : ''}
                  </div>
                  <div class="list-day-right">
                    ${cycle && !isSpecial ? renderPeriods(cycle) : ''}
                    <span class="list-chevron" aria-hidden="true"></span>
                  </div>
              `;

              // ── Overlay calendar events for this day ───────────────────
              const overlayEvs = calendarOverlayEventsByDate[dayKey] || [];
              const overlaySection = overlayEvs.length > 0
                  ? `<div class="list-detail-overlay">
                      <span class="list-detail-overlay-label">Calendar</span>
                      ${overlayEvs.map(ev =>
                          `<div class="list-detail-overlay-event">
                            ${ev.startTime ? `<span class="list-detail-overlay-time">${ev.startTime}</span>` : ''}
                            <span>${ev.title}</span>
                          </div>`
                      ).join('')}
                    </div>`
                  : '';

              // ── Expanded detail ────────────────────────────────────────
              let detailInner = '';
              if (isSpecial || !cycle) {
                  const noteText = dayData.note || '';
                  const noteHtml = noteText
                      ? `<div class="list-detail-note">${noteText}</div>`
                      : (overlayEvs.length === 0 ? `<div class="list-detail-note list-detail-note--muted">No additional details.</div>` : '');
                  detailInner = overlaySection + noteHtml;
              } else {
                  const periods = getPeriodsForDay(cycle);
                  const detailRows = periods.map(code => {
                      const di = getBlockDisplayInfo(code);

                      const codeClass = di.isAssigned
                          ? `list-detail-code on${dutyColorMode === 'category' ? ` cat-${di.category}` : ''}`
                          : 'list-detail-code off';

                      // Title is the primary label. "Teaching" may only appear as secondary category metadata.
                      const titleHtml = di.title
                          ? `<span class="list-detail-title">${di.title}</span>`
                          : '';
                      // Show category only when there is a real imported assignment title.
                      const hasRealTitle = di.isAssigned && scheduleAssignments[code];
                      const catHtml = (hasRealTitle && di.categoryLabel)
                          ? `<span class="list-detail-cat">${di.categoryLabel}</span>`
                          : '';

                      return `<div class="list-detail-row${di.isAssigned ? ' assigned' : ''}">
                          <span class="${codeClass}">${di.slotLabel}</span>
                          ${titleHtml}
                          ${catHtml}
                          ${di.room ? `<span class="list-detail-room">${di.room}</span>` : ''}
                      </div>`;
                  }).join('');

                  const noteRow = dayData.note
                      ? `<div class="list-detail-note">${dayData.note}</div>`
                      : '';
                  detailInner = overlaySection + detailRows + noteRow;
              }

              html += `
                <div class="${rowClasses}" data-day="${dayKey}"
                     onclick="toggleListDay('${dayKey}')">
                  <div class="list-day-summary">${summaryInner}</div>
                  <div class="list-day-detail">${detailInner}</div>
                </div>
              `;
          }

          html += `</div></section>`;
          return html;
      }

      // Toggle the expanded state of a list-view day row without a full re-render.
      function toggleListDay(key) {
          const el = document.querySelector(`.list-day[data-day="${key}"]`);
          if (!el) return;
          const wasExpanded = el.classList.contains('expanded');

          // Collapse any open row
          document.querySelectorAll('.list-day.expanded').forEach(d => d.classList.remove('expanded'));

          if (!wasExpanded) {
              el.classList.add('expanded');
              expandedListDay = key;
          } else {
              expandedListDay = null;
          }
      }

      // Return the category for a block code, falling back to 'teaching' for
      // assigned blocks with no recorded category (manually toggled via the grid).
      function getBlockCategory(code) {
          return scheduleCategories[code] || (selectedClasses.has(code) ? 'teaching' : null);
      }

      // Authoritative display info for a single block code.
      // title is the assignment title when one exists; "Assigned" when assigned but
      // no imported title; "" when not assigned.
      // "Teaching" may appear only in categoryLabel — never as the primary title.
      function getBlockDisplayInfo(code) {
          const slotLabel  = code.includes('-') ? code.split('-')[1] : code.slice(1);
          const isAssigned = selectedClasses.has(code);
          const rawTitle   = scheduleAssignments[code] || '';
          const title      = isAssigned ? (rawTitle || 'Assigned') : '';
          const category   = isAssigned ? (scheduleCategories[code] || 'teaching') : null;
          const categoryLabel = category ? ({
              teaching: 'Teaching', homeroom: 'Homeroom', advisory: 'Advisory',
              elb: 'ELB', planning: 'Planning', other: 'Other'
          }[category] || category) : '';
          const room = scheduleRooms[code] || '';
          return { code, slotLabel, isAssigned, title, category, categoryLabel, room };
      }

      // CSS classes for a single pill in the monthly strip.
      function getPillClass(code) {
          const on = selectedClasses.has(code);
          if (!on) return 'pill';
          if (dutyColorMode === 'category') {
              return `pill on cat-${getBlockCategory(code) || 'teaching'}`;
          }
          return 'pill on';
      }

      // Render periods inline for the daily view.
      function renderPeriodsInline(cycleCode) {
          if (!cycleCode || SPECIAL_CYCLES.includes(cycleCode)) return '';

          const periods = getPeriodsForDay(cycleCode);

          return periods.map(p => {
              const isAssigned = selectedClasses.has(p);
              const label      = formatInlinePeriodLabel(p);
              const tooltip    = getBlockTooltip(p);

              if (!isAssigned) {
                  return `<div class="period-dot free" title="${tooltip}">${label}</div>`;
              }

              if (dutyColorMode === 'category') {
                  const cat   = getBlockCategory(p) || 'teaching';
                  const title = scheduleAssignments[p] || '';
                  const short = title.length > 11 ? title.slice(0, 11) + '…' : title;
                  return `<div class="period-dot teaching cat-${cat}" title="${tooltip}">` +
                      `<span class="dot-code">${label}</span>` +
                      (short ? `<span class="dot-title">${short}</span>` : '') +
                      `</div>`;
              }

              return `<div class="period-dot teaching" title="${tooltip}">${label}</div>`;
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
                  const label = getSlotFromCode(p);
                  return `<div class="${getPillClass(p)}" title="${getBlockTooltip(p)}">${label}</div>`;
              }).join('');
          }

          return `<div class="periods${teachCount === 0 && !isSpecial ? ' none' : ''}">${pills}</div>`;
      }

      // ── Schedule view mode ──────────────────────────────────────────────

      const VIEW_BREAKPOINT = 680; // px — below this auto-mode shows list

      function getEffectiveScheduleView() {
          if (scheduleViewMode === 'month') return 'monthly';
          if (scheduleViewMode === 'list')  return 'list';
          // auto: respond to viewport width
          return window.innerWidth <= VIEW_BREAKPOINT ? 'list' : 'monthly';
      }

      function refreshViewControl() {
          const el = document.getElementById('viewControl');
          if (!el) return;
          el.querySelectorAll('.seg-btn').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.mode === scheduleViewMode);
          });
      }

      function setScheduleViewMode(mode) {
          scheduleViewMode = ['auto', 'month', 'list'].includes(mode) ? mode : 'auto';
          expandedListDay  = null;
          refreshViewControl();
          saveSettings();
          updateCalendar();
      }

      // ── Duty color mode ────────────────────────────────────────────────

      function refreshDutyColorControl() {
          document.querySelectorAll('#dutyColorControl .seg-btn').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.mode === dutyColorMode);
          });
      }

      function setDutyColorMode(mode) {
          dutyColorMode = mode === 'category' ? 'category' : 'single';
          refreshDutyColorControl();
          saveSettings();
          updateCalendar();
      }

      // ── Import preview ──────────────────────────────────────────────────

      const PREVIEW_CATEGORY_OPTIONS = ['teaching', 'homeroom', 'advisory', 'elb', 'planning', 'other'];
      const PREVIEW_CATEGORY_LABELS  = {
          teaching: 'Teaching',
          homeroom: 'Homeroom',
          advisory: 'Advisory',
          elb:      'ELB',
          planning: 'Planning',
          other:    'Other'
      };

      let pendingPreviewRows = [];

      function openPreviewPanel() {
          document.getElementById('previewBackdrop').classList.add('open');
          document.getElementById('importPreviewPanel').classList.add('open');
      }

      function closePreviewPanel() {
          document.getElementById('previewBackdrop').classList.remove('open');
          document.getElementById('importPreviewPanel').classList.remove('open');
          pendingPreviewRows = [];
      }

      function applyImportPreview() {
          const newSelectedClasses  = new Set();
          const newAssignments      = {};
          const newCategories       = {};
          const newRooms            = {};

          pendingPreviewRows.forEach(row => {
              newCategories[row.blockCode] = row.category;
              if (row.title) newAssignments[row.blockCode] = row.title;
              if (row.room)  newRooms[row.blockCode]       = row.room;
              if (row.included) newSelectedClasses.add(row.blockCode);
          });

          selectedClasses      = newSelectedClasses;
          scheduleAssignments  = newAssignments;
          scheduleCategories   = newCategories;
          scheduleRooms        = newRooms;

          saveSettings();
          createClassGrid();
          updateCalendar();
          closePreviewPanel();

          const count = newSelectedClasses.size;
          showToast(`Applied ${count} block${count === 1 ? '' : 's'} from import`);
      }

      function _previewIncludedCount() {
          return pendingPreviewRows.filter(r => r.included).length;
      }

      function _updatePreviewCounts() {
          const included = _previewIncludedCount();
          const total    = pendingPreviewRows.length;
          const subtitle = document.getElementById('previewSubtitle');
          const footInfo = document.getElementById('previewFooterInfo');
          if (subtitle) subtitle.textContent =
              `${total} block${total === 1 ? '' : 's'} detected · ${included} selected`;
          if (footInfo) footInfo.textContent =
              `${included} block${included === 1 ? '' : 's'} will be applied`;
      }

      function _buildPreviewRows(parsed) {
          // Combine teaching blocks and planning/ignored blocks, sort non-planning first.
          const all = [
              ...parsed.blocks,
              ...parsed.ignoredBlocks
          ].sort((a, b) => {
              const ap = a.category === 'planning' ? 1 : 0;
              const bp = b.category === 'planning' ? 1 : 0;
              if (ap !== bp) return ap - bp;
              return a.blockCode.localeCompare(b.blockCode);
          });

          return all.map(block => ({
              blockCode:  block.blockCode,
              category:   block.category,
              title:      block.title   || '',
              room:       block.room    || '',
              sourceText: block.sourceText || '',
              included:   block.category !== 'planning'
          }));
      }

      function _renderPreviewTableBody() {
          const tbody = document.getElementById('previewTableBody');
          if (!tbody) return;
          tbody.innerHTML = '';

          pendingPreviewRows.forEach((row, index) => {
              const tr = document.createElement('tr');
              tr.className = `preview-row${row.included ? '' : ' excluded'}`;

              // Checkbox
              const tdCheck   = document.createElement('td');
              const checkbox  = document.createElement('input');
              checkbox.type   = 'checkbox';
              checkbox.className = 'preview-check';
              checkbox.checked   = row.included;
              checkbox.addEventListener('change', () => {
                  pendingPreviewRows[index].included = checkbox.checked;
                  tr.classList.toggle('excluded', !checkbox.checked);
                  _updatePreviewCounts();
              });
              tdCheck.appendChild(checkbox);

              // Block code
              const tdCode = document.createElement('td');
              const codeChip = document.createElement('span');
              codeChip.className = `preview-code cat-${row.category}`;
              codeChip.textContent = row.blockCode;
              tdCode.appendChild(codeChip);

              // Category select
              const tdCat  = document.createElement('td');
              const select = document.createElement('select');
              select.className = `preview-cat-select cat-${row.category}`;
              PREVIEW_CATEGORY_OPTIONS.forEach(cat => {
                  const opt      = document.createElement('option');
                  opt.value      = cat;
                  opt.textContent = PREVIEW_CATEGORY_LABELS[cat];
                  opt.selected   = cat === row.category;
                  select.appendChild(opt);
              });
              select.addEventListener('change', () => {
                  const newCat = select.value;
                  pendingPreviewRows[index].category = newCat;
                  select.className   = `preview-cat-select cat-${newCat}`;
                  codeChip.className = `preview-code cat-${newCat}`;
              });
              tdCat.appendChild(select);

              // Title
              const tdTitle = document.createElement('td');
              tdTitle.className   = 'preview-title';
              tdTitle.textContent = row.title || '—';

              // Room
              const tdRoom = document.createElement('td');
              tdRoom.className   = 'preview-room';
              tdRoom.textContent = row.room || '—';

              // Source (truncated, full text in tooltip)
              const tdSrc = document.createElement('td');
              tdSrc.className   = 'preview-source';
              tdSrc.title       = row.sourceText;
              tdSrc.textContent = row.sourceText.length > 55
                  ? row.sourceText.slice(0, 55) + '…'
                  : row.sourceText;

              tr.append(tdCheck, tdCode, tdCat, tdTitle, tdRoom, tdSrc);
              tbody.appendChild(tr);
          });
      }

      function showImportPreview(parsed) {
          pendingPreviewRows = _buildPreviewRows(parsed);
          _renderPreviewTableBody();
          _updatePreviewCounts();
          openPreviewPanel();
      }

      // ── End import preview ──────────────────────────────────────────────

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

      // View toggles (legacy setView kept for PDF export compatibility)
      function setView(view) {
          currentView = view;
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
          saveSettings();
      }

      // Color customization (guards against missing inputs)
      function updateColors() {
          const tcEl = document.getElementById('teachingColor');
          const fcEl = document.getElementById('freeColor');
          if (!tcEl || !fcEl) return;
          const teachingColor = sanitizeHexColor(tcEl.value, '#10b981');
          const freeColor     = sanitizeHexColor(fcEl.value, '#e5e7eb');
          tcEl.value = teachingColor;
          fcEl.value = freeColor;
          document.documentElement.style.setProperty('--teaching-color', teachingColor);
          document.documentElement.style.setProperty('--free-color', freeColor);
          refreshColorSwatches();
          saveSettings();
      }

      // ── Export PDF modal ────────────────────────────────────────────────────

      function openExportModal() {
          const calendarData = getFilteredCalendarData();
          if (Object.keys(calendarData).length === 0) {
              showToast('No calendar data to export. Upload an ICS calendar first.', 'error');
              return;
          }
          document.getElementById('exportPdfBackdrop').classList.add('open');
          document.getElementById('exportPdfModal').classList.add('open');
          document.getElementById('exportPdfCancelBtn').focus();
      }

      function closeExportModal() {
          document.getElementById('exportPdfBackdrop').classList.remove('open');
          document.getElementById('exportPdfModal').classList.remove('open');
      }

      async function exportMonthlyOverview() {
          const calendarData = getFilteredCalendarData();
          const btn = document.getElementById('exportMonthlyBtn');
          btn.classList.add('loading');
          btn.disabled = true;
          try {
              await window.PdfExport.generateMonthlyOverviewPDF(
                  calendarData, selectedClasses, scheduleAssignments,
                  scheduleCategories, scheduleRooms, dutyColorMode,
                  calendarOverlayEventsByDate
              );
              closeExportModal();
              showToast('Monthly Overview PDF downloaded.');
          } catch (err) {
              console.error('Monthly PDF export failed:', err);
              showToast('PDF export failed: ' + err.message, 'error');
          } finally {
              btn.classList.remove('loading');
              btn.disabled = false;
          }
      }

      async function exportDailyList() {
          const calendarData = getFilteredCalendarData();
          const btn = document.getElementById('exportDailyBtn');
          btn.classList.add('loading');
          btn.disabled = true;
          try {
              await window.PdfExport.generateDailyListPDF(
                  calendarData, selectedClasses, scheduleAssignments,
                  scheduleCategories, scheduleRooms, dutyColorMode,
                  calendarOverlayEventsByDate
              );
              closeExportModal();
              showToast('Daily List PDF downloaded.');
          } catch (err) {
              console.error('Daily list PDF export failed:', err);
              showToast('PDF export failed: ' + err.message, 'error');
          } finally {
              btn.classList.remove('loading');
              btn.disabled = false;
          }
      }

      // Keep legacy name so any stale inline refs don't break.
      function exportToPDF() { openExportModal(); }

      // LocalStorage
      function saveSettings() {
          saveTeacherScheduleSettings({
              selectedClasses: Array.from(selectedClasses),
              scheduleAssignments,
              scheduleCategories,
              scheduleRooms,
              dutyColorMode,
              scheduleViewMode
          });
      }

      function loadSettings() {
          migrateStoredStateIfNeeded();

          const settings = loadTeacherScheduleSettings();
          selectedClasses     = new Set(settings.selectedClasses || []);
          scheduleAssignments = settings.scheduleAssignments || {};
          scheduleCategories  = settings.scheduleCategories  || {};
          scheduleRooms       = settings.scheduleRooms       || {};
          dutyColorMode       = settings.dutyColorMode       || 'single';
          scheduleViewMode    = settings.scheduleViewMode    || 'auto';

          const importedCalendarState = loadImportedCalendarState();
          if (importedCalendarState.useImportedData && Object.keys(importedCalendarState.importedCalendarData).length > 0) {
              importedCalendarData = importedCalendarState.importedCalendarData;
              useImportedData = true;
              showToast('Using imported calendar data');
          }

          calendarOverlayEventsByDate = loadOverlayEvents() || {};

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
