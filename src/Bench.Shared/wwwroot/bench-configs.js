// What each library's date and time fields look like in the DOM - the only part of the picker bench that
// differs between the five apps. bench.js drives the same scenarios through these hooks:
//   mounted()        all fields are in the DOM
//   openDate(field)  open the calendar of a date field;  calendarReady() its day grid is shown
//   next()           the next-month button;               title()         the month the calendar shows
//   closeDate()      close the calendar
//   dateInput(field) the text input of a date field;      typed           2026-10-15 written for en-US
//   openTime(field)  open the time popup;                  timeReady()     it is shown;  closeTime()
// Every library is opened with the same press(): the whole pointer sequence a real click makes, at the element's
// centre and with a click count of 1 - Radzen opens on mousedown, FluentUI ignores a click with no count, and a
// click at (0,0) reads as "outside" to light-dismiss handlers.
(function () {
    'use strict';

    function q(selector) { return document.querySelector(selector); }
    function all(selector) { return document.querySelectorAll(selector); }
    function text(root, selector) { var e = root && root.querySelector(selector); return e ? e.textContent.trim() : ''; }
    function last(selector) { var e = all(selector); return e[e.length - 1]; }

    function press(element) {
        var box = element.getBoundingClientRect();
        var init = {
            bubbles: true, cancelable: true, composed: true, view: window, button: 0, detail: 1,
            clientX: box.x + box.width / 2, clientY: box.y + box.height / 2
        };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
            element.dispatchEvent(type.indexOf('pointer') === 0 ? new PointerEvent(type, init) : new MouseEvent(type, init));
        });
    }

    function outside() { press(q('.bench h1')); if (document.activeElement) document.activeElement.blur(); }

    var radzenPopup = function () {
        return Array.prototype.find.call(all('.rz-datepicker-popup-container'), function (p) { return p.style.display === 'block'; });
    };
    var blazoriseCalendar = function () { return q('.datepicker-calendar.show'); };
    var fluentPopover = function () {
        return Array.prototype.find.call(all('.bench-date fluent-popover-b'), function (p) {
            var d = p.shadowRoot && p.shadowRoot.querySelector('[popover]');
            return d && d.matches(':popover-open');
        });
    };

    function day(root, selector, number) {
        const found = Array.from(root.querySelectorAll(selector)).find(e =>
            e.textContent.trim() === String(number) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
        if (!found) throw new Error('enabled current-month day missing: ' + number);
        press(found);
    }

    window.benchConfigs = {
        Flare: {
            library: 'Flare',
            pickDay: n => day(q('.flare-datepicker__panel[role=dialog]'), '[role=gridcell]', n),
            mounted: function (count = 50) { return all('.bench-time .flare-input__toggle').length >= count; },
            openDate: function (f) { press(f.querySelector('.flare-input__toggle')); },
            // Shown, not only rendered: the panel counts once it is placed in the top layer.
            calendarReady: function () { return !!q('.flare-datepicker__panel[role=dialog]:popover-open button[role=gridcell]'); },
            next: function () { return last('.flare-datepicker__panel[role=dialog] .flare-datepicker__header button[aria-label]'); },
            title: function () { return text(document, '.flare-datepicker__panel[role=dialog] .flare-datepicker__month-label'); },
            closeDate: function () { press(q('.flare-picker__scrim')); },
            dateInput: function (f) { return f.querySelector('input'); },
            typed: '10/15/2026',
            openTime: function (f) { press(f.querySelector('.flare-input__toggle')); },
            timeReady: function () { return !!q('.flare-timepicker [role=dialog]:popover-open'); },
            closeTime: function () { q('.flare-timepicker [role=dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
        },
        MudBlazor: {
            library: 'MudBlazor',
            pickDay: n => day(q('.mud-popover-open'), '.mud-day', n),
            mounted: function (count = 50) { return all('.bench-time .mud-input-adornment button').length >= count; },
            openDate: function (f) { press(f.querySelector('.mud-input-adornment button')); },
            calendarReady: function () { return !!q('.mud-popover-open .mud-day'); },
            next: function () { return last('.mud-popover-open .mud-picker-calendar-header-switch button'); },
            title: function () { return text(document, '.mud-popover-open .mud-picker-calendar-header-transition'); },
            closeDate: function () { press(q('.mud-overlay')); },
            dateInput: function (f) { return f.querySelector('input'); },
            typed: '10/15/2026',
            openTime: function (f) { press(f.querySelector('.mud-input-adornment button')); },
            timeReady: function () { return !!q('.mud-popover-open .mud-picker-timepicker-toolbar'); },
            closeTime: function () { press(q('.mud-overlay')); }
        },
        Radzen: {
            library: 'Radzen',
            pickDay: n => day(radzenPopup(), 'td', n),
            mounted: function (count = 50) { return all('.bench-time .rz-datepicker-trigger').length >= count; },
            openDate: function (f) { press(f.querySelector('.rz-datepicker-trigger')); },
            calendarReady: function () { var p = radzenPopup(); return !!(p && p.querySelector('td')); },
            next: function () { return radzenPopup().querySelector('button[aria-label="Next month"]'); },
            title: function () { return text(radzenPopup(), '.rz-calendar-title-button'); },
            closeDate: outside,
            dateInput: function (f) { return f.querySelector('input'); },
            typed: '10/15/2026',
            openTime: function (f) { press(f.querySelector('.rz-datepicker-trigger')); },
            timeReady: function () { return !!radzenPopup(); },
            closeTime: outside
        },
        Blazorise: {
            library: 'Blazorise',
            pickDay: n => day(blazoriseCalendar(), '.datepicker-day', n),
            mounted: function (count = 50) { return all('.bench-time .timepicker input').length >= count; },
            openDate: function (f) { var i = f.querySelector('input'); i.focus(); press(i); },
            calendarReady: function () { var c = blazoriseCalendar(); return !!(c && c.querySelector('.datepicker-day')); },
            next: function () { return blazoriseCalendar().querySelector('[aria-label="Next month"]'); },
            title: function () {
                var c = blazoriseCalendar();
                return c ? Array.prototype.map.call(c.querySelectorAll('.datepicker-title select, .datepicker-title input'), function (x) { return x.value; }).join(' ') : '';
            },
            closeDate: outside,
            dateInput: function (f) { return f.querySelector('input'); },
            typed: '10/15/2026',
            openTime: function (f) { var i = f.querySelector('input'); i.focus(); press(i); },
            timeReady: function () { return !!q('.bench-time .dropdown-menu.show'); },
            closeTime: outside
        },
        FluentUI: {
            library: 'FluentUI',
            pickDay: n => day(fluentPopover(), '.day', n),
            mounted: function (count = 50) { return all('.bench-time fluent-dropdown').length >= count; },
            openDate: function (f) { press(f.querySelector('svg[role=button]')); },
            calendarReady: function () { var p = fluentPopover(); return !!(p && p.querySelector('.fluent-calendar .day')); },
            next: function () { return fluentPopover().querySelector('.fluent-calendar .next'); },
            title: function () { return text(fluentPopover(), '.fluent-calendar .title .label'); },
            closeDate: function () { fluentPopover().closePopover(); },
            dateInput: function (f) { return f.querySelector('fluent-text-input')?.shadowRoot?.querySelector('input'); },
            typed: '10/15/2026',
            openTime: function (f) { press(f.querySelector('fluent-dropdown')); },
            timeReady: function () { return !!q('.bench-time fluent-listbox:popover-open'); },
            closeTime: function () { q('.bench-time fluent-listbox:popover-open').hidePopover(); }
        }
    };
})();
