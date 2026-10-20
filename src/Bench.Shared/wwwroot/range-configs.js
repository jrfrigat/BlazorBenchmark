// What each library's date range looks like in the DOM. The same driver (range.js) measures all five:
//   fields   two linked date fields, typed and picked through their own popups
//   calendar the native inline range calendar
//   popup    the native popup range where the library ships one
// Every library is opened with the same press(): the whole pointer sequence a real click makes, at the
// element's centre and with a click count of 1.
(function () {
    'use strict';

    function q(root, selector) { return (root || document).querySelector(selector); }
    function all(root, selector) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
    function last(root, selector) { var e = all(root, selector); return e[e.length - 1]; }
    function text(root, selector) { var e = q(root, selector); return e ? e.textContent.trim() : ''; }

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

    function outside() { press(q(document, '.bench h1')); if (document.activeElement) document.activeElement.blur(); }

    function day(root, selector, number) {
        var found = all(root, selector).find(function (e) {
            return e.textContent.trim() === String(number) &&
                !e.disabled && e.getAttribute('aria-disabled') !== 'true' &&
                !Array.from(e.classList).some(function (name) { return /outside|other|adjacent/i.test(name); });
        });
        if (!found) throw new Error('enabled day missing: ' + number);
        press(found);
    }

    // Fluent calendars render the previous and next month's edge days without an outside class;
    // their aria-label names the month, so the visible month comes from the title.
    function fluentDay(root, number) {
        var title = text(root, '.fluent-calendar .title .label');
        var month = title.split(' ')[0];
        var found = all(root, '.day').find(function (e) {
            return e.textContent.trim() === String(number) && !e.disabled &&
                e.getAttribute('aria-disabled') !== 'true' &&
                (!month || (e.getAttribute('aria-label') || '').indexOf(month) >= 0);
        });
        if (!found) throw new Error('enabled day missing: ' + number);
        press(found);
    }

    function shown(selector) {
        return all(document, selector).find(function (e) {
            return e.style.display !== 'none' && e.getClientRects().length > 0;
        });
    }

    var radzenPopup = function () { return shown('.rz-datepicker-popup-container'); };
    var blazoriseCalendar = function () { return q(document, '.datepicker-calendar.show'); };
    var fluentPopover = function () {
        return all(document, '.bench-range fluent-popover-b').find(function (p) {
            var d = p.shadowRoot && p.shadowRoot.querySelector('[popover]');
            return d && d.matches(':popover-open');
        });
    };

    window.rangeConfigs = {
        Flare: {
            library: 'Flare',
            hasPopup: false,
            mounted: function (profile, count) {
                if (profile === 'calendar') return all(document, '.bench-range .flare-daterangepicker__calendar').length === count;
                return all(document, '.bench-range .flare-daterangepicker__fields').length === count;
            },
            field: function (unit, which) { return all(unit, '.flare-daterangepicker .flare-datepicker')[which]; },
            input: function (unit, which) { return all(unit, '.flare-daterangepicker input')[which]; },
            open: function (root) { press(q(root, '.flare-input__toggle')); },
            ready: function (root) { return !!q(root, '.flare-datepicker__panel[role=dialog]:popover-open button[role=gridcell]'); },
            pick: function (root, number) { day(q(root, '.flare-datepicker__panel[role=dialog]:popover-open'), '[role=gridcell]', number); },
            next: function (root) { return last(q(root, '.flare-datepicker__panel[role=dialog]:popover-open'), '.flare-datepicker__header button[aria-label]'); },
            prev: function (root) { return q(q(root, '.flare-datepicker__panel[role=dialog]:popover-open'), '.flare-datepicker__header button[aria-label]'); },
            title: function (root) { return text(q(root, '.flare-datepicker__panel[role=dialog]:popover-open'), '.flare-datepicker__month-label'); },
            close: function () { var scrim = q(document, '.flare-picker__scrim'); if (scrim) press(scrim); else outside(); },
            calendarRoot: function (unit) { return q(unit, '.flare-daterangepicker__calendar'); },
            calendarPick: function (unit, number) { day(q(unit, '.flare-daterangepicker__calendar'), '[role=gridcell]', number); },
            calendarNext: function (unit) { return last(q(unit, '.flare-daterangepicker__calendar'), '.flare-datepicker__header button[aria-label]'); },
            calendarPrev: function (unit) { return q(q(unit, '.flare-daterangepicker__calendar'), '.flare-datepicker__header button[aria-label]'); },
            calendarTitle: function (unit) { return text(q(unit, '.flare-daterangepicker__calendar'), '.flare-datepicker__month-label'); }
        },
        MudBlazor: {
            library: 'MudBlazor',
            hasPopup: true,
            mounted: function (profile, count) {
                if (profile === 'calendar') return all(document, '.bench-range .mud-picker').length >= count;
                if (profile === 'popup') return all(document, '.bench-range input').length >= count;
                return all(document, '.bench-range .mud-input-adornment button').length >= count * 2;
            },
            field: function (unit, which) { return all(unit, '.bench-field')[which]; },
            input: function (unit, which) { return all(unit, '.bench-field input')[which]; },
            open: function (root) { press(q(root, '.mud-input-adornment button')); },
            ready: function () { return !!q(document, '.mud-popover-open .mud-day'); },
            pick: function (root, number) { day(q(document, '.mud-popover-open'), '.mud-day', number); },
            next: function () { return last(q(document, '.mud-popover-open'), '.mud-picker-calendar-header-switch button'); },
            prev: function () { return q(q(document, '.mud-popover-open'), '.mud-picker-calendar-header-switch button'); },
            title: function () { return text(q(document, '.mud-popover-open'), '.mud-picker-calendar-header-transition'); },
            close: function () {
                var overlay = shown('.mud-overlay');
                if (overlay) press(overlay); else outside();
            },
            calendarRoot: function (unit) { return q(unit, '.mud-picker'); },
            calendarPick: function (unit, number) { day(q(unit, '.mud-picker'), '.mud-day', number); },
            calendarNext: function (unit) { return last(q(unit, '.mud-picker'), '.mud-picker-calendar-header-switch button'); },
            calendarPrev: function (unit) { return q(q(unit, '.mud-picker'), '.mud-picker-calendar-header-switch button'); },
            calendarTitle: function (unit) { return text(q(unit, '.mud-picker'), '.mud-picker-calendar-header-transition'); }
        },
        Radzen: {
            library: 'Radzen',
            hasPopup: true,
            mounted: function (profile, count) {
                if (profile === 'calendar') return all(document, '.bench-range .rz-calendar').length === count;
                if (profile === 'popup') return all(document, '.bench-range .rz-datepicker-trigger').length >= count;
                return all(document, '.bench-range .rz-datepicker-trigger').length >= count * 2;
            },
            field: function (unit, which) { return all(unit, '.bench-field')[which]; },
            input: function (unit, which) { return all(unit, '.bench-field input')[which]; },
            open: function (root) { press(q(root, '.rz-datepicker-trigger')); },
            ready: function () { var p = radzenPopup(); return !!(p && p.querySelector('td')); },
            pick: function (root, number) { day(radzenPopup(), 'td', number); },
            next: function () { return q(radzenPopup(), 'button[aria-label="Next month"]'); },
            prev: function () { return q(radzenPopup(), 'button[aria-label="Previous month"]'); },
            title: function () { return text(radzenPopup(), '.rz-calendar-title-button'); },
            close: outside,
            calendarRoot: function (unit) { return q(unit, '.rz-calendar'); },
            calendarPick: function (unit, number) { day(q(unit, '.rz-calendar'), 'td', number); },
            calendarNext: function (unit) { return q(q(unit, '.rz-calendar'), 'button[aria-label="Next month"]'); },
            calendarPrev: function (unit) { return q(q(unit, '.rz-calendar'), 'button[aria-label="Previous month"]'); },
            calendarTitle: function (unit) { return text(q(unit, '.rz-calendar'), '.rz-calendar-title-button'); }
        },
        Blazorise: {
            library: 'Blazorise',
            hasPopup: true,
            mounted: function (profile, count) {
                if (profile === 'calendar') return all(document, '.bench-range .datepicker-calendar').length === count;
                if (profile === 'popup') return all(document, '.bench-range input').length >= count;
                return all(document, '.bench-range .bench-field input').length >= count * 2;
            },
            field: function (unit, which) { return all(unit, '.bench-field')[which]; },
            input: function (unit, which) { return all(unit, '.bench-field input')[which]; },
            open: function (root) { var i = q(root, 'input'); i.focus(); press(i); },
            ready: function () { var c = blazoriseCalendar(); return !!(c && c.querySelector('.datepicker-day')); },
            pick: function (root, number) { day(blazoriseCalendar(), '.datepicker-day', number); },
            next: function () { return q(blazoriseCalendar(), '[aria-label="Next month"]'); },
            prev: function () { return q(blazoriseCalendar(), '[aria-label="Previous month"]'); },
            title: function () {
                var c = blazoriseCalendar();
                return c ? all(c, '.datepicker-title select, .datepicker-title input').map(function (x) { return x.value; }).join(' ') : '';
            },
            close: outside,
            calendarRoot: function (unit) { return q(unit, '.datepicker-calendar'); },
            calendarPick: function (unit, number) { day(q(unit, '.datepicker-calendar'), '.datepicker-day', number); },
            calendarNext: function (unit) { return q(q(unit, '.datepicker-calendar'), '[aria-label="Next month"]'); },
            calendarPrev: function (unit) { return q(q(unit, '.datepicker-calendar'), '[aria-label="Previous month"]'); },
            calendarTitle: function (unit) {
                var c = q(unit, '.datepicker-calendar');
                return c ? all(c, '.datepicker-title select, .datepicker-title input').map(function (x) { return x.value; }).join(' ') : '';
            }
        },
        FluentUI: {
            library: 'FluentUI',
            hasPopup: false,
            mounted: function (profile, count) {
                if (profile === 'calendar') return all(document, '.bench-range .fluent-calendar').length === count;
                return all(document, '.bench-range .bench-field fluent-text-input').length >= count * 2;
            },
            field: function (unit, which) { return all(unit, '.bench-field')[which]; },
            input: function (unit, which) {
                var field = all(unit, '.bench-field')[which];
                return field && field.querySelector('fluent-text-input')?.shadowRoot?.querySelector('input');
            },
            open: function (root) { press(q(root, 'svg[role=button]')); },
            ready: function () {
                var p = fluentPopover();
                return !!(p && p.querySelector('.fluent-calendar .day'));
            },
            pick: function (root, number) { fluentDay(fluentPopover(), number); },
            next: function () { return q(fluentPopover(), '.fluent-calendar .next'); },
            prev: function () { return q(fluentPopover(), '.fluent-calendar .previous'); },
            title: function () { return text(fluentPopover(), '.fluent-calendar .title .label'); },
            close: function () { var p = fluentPopover(); if (p) p.closePopover(); },
            calendarRoot: function (unit) { return q(unit, '.fluent-calendar'); },
            calendarPick: function (unit, number) { fluentDay(q(unit, '.fluent-calendar'), number); },
            calendarNext: function (unit) { return q(q(unit, '.fluent-calendar'), '.next'); },
            calendarPrev: function (unit) { return q(q(unit, '.fluent-calendar'), '.previous'); },
            calendarTitle: function (unit) { return text(q(unit, '.fluent-calendar'), '.title .label'); }
        }
    };
})();
