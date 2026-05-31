
(function(global) {
    'use strict';

    // ============================================
    // GLOBAL TIMER MANAGER (Replaces React Context)
    // ============================================
    const TimerManager = {
        currentTime: Date.now(),
        serverOffset: 0,
        intervalId: null,
        listeners: new Set(),
        tickInterval: 1000, // Update every second
        isSyncing: false,

        async syncWithServer() {
            if (this.isSyncing) return;
            this.isSyncing = true;
            try {
                if (window.supabaseClient) {
                    const start = performance.now();
                    const { data, error } = await window.supabaseClient.rpc('get_server_time');
                    const end = performance.now();

                    if (!error && data) {
                        const serverTime = new Date(data).getTime();
                        const latency = (end - start) / 2;
                        this.serverOffset = (serverTime + latency) - Date.now();
                    }
                }
            } catch (e) {
                console.warn('TimerManager: Server sync failed, using local clock.', e);
            } finally {
                this.isSyncing = false;
                this.currentTime = Date.now() + this.serverOffset;
                this.notifyListeners();
            }
        },

        init() {
            if (this.intervalId) return;

            this.syncWithServer();
            this.intervalId = setInterval(() => {
                this.currentTime = Date.now() + this.serverOffset;
                this.notifyListeners();
            }, this.tickInterval);

            // Visibility/Focus recovery
            if (!this._visibilityHandler) {
                this._visibilityHandler = () => {
                    if (document.visibilityState === 'visible') {
                        this.syncWithServer();
                    }
                };
                document.addEventListener('visibilitychange', this._visibilityHandler);
                window.addEventListener('focus', this._visibilityHandler);
            }
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        destroy() {
            this.stop();
            this.listeners.clear();
            if (this._visibilityHandler) {
                document.removeEventListener('visibilitychange', this._visibilityHandler);
                window.removeEventListener('focus', this._visibilityHandler);
                this._visibilityHandler = null;
            }
        },

        getTime() {
            return this.currentTime;
        },

        subscribe(callback) {
            this.listeners.add(callback);
            if (this.listeners.size === 1) {
                this.init();
            }
            // Trigger immediately with current time
            callback(this.currentTime);
            return () => {
                this.listeners.delete(callback);
                if (this.listeners.size === 0) {
                    this.stop();
                }
            };
        },

        notifyListeners() {
            this.listeners.forEach(cb => {
                try {
                    cb(this.currentTime);
                } catch (e) {
                    console.error('TimerManager listener error:', e);
                }
            });
        }
    };

    // ============================================
    // UTILITY HELPERS
    // ============================================
    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    const Icons = {
        Clock: (size = 18) => `
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
        `
    };

    // ============================================
    // COUNTDOWN CLASS
    // ============================================
    const CountdownRegistry = new WeakMap();

    class Countdown {
        constructor(options = {}) {
            // Props with defaults
            this.targetDate = options.targetDate || new Date();
            this.startTime = options.startTime || null;
            this.startAt = options.startAt || null;
            this.onStart = options.onStart || null;
            this.onEnd = options.onEnd || null;
            this.className = options.className || '';
            this.showIcon = options.showIcon !== false;
            this.showProgress = options.showProgress === true;
            this.compact = options.compact === true;
            this.endLabel = options.endLabel !== undefined ? options.endLabel : 'Ended';
            this.upcomingLabel = options.upcomingLabel || 'Starts in';
            this.label = options.label || '';
            this.headless = options.headless === true;
            this.onTick = options.onTick || null;

            // Internal state
            this.container = null;
            this.timeLeft = null;
            this.hasStartedCalled = false;
            this.hasEndedCalled = false;
            this.targetTimestamp = null;
            this.unsubscribe = null;
            this.mounted = false;

            // Create container if target element provided
            if (options.selector) {
                this.mount(options.selector);
            }
        }

        // Parse date to timestamp
        _parse(d) {
            if (d === null || d === undefined || d === '') return null;
            // Handle numeric strings (timestamps)
            if (typeof d === 'string' && /^\d+$/.test(d)) return parseInt(d);
            if (typeof d === 'number') return d;
            const ts = new Date(d).getTime();
            return isNaN(ts) ? null : ts;
        }

        parseTargetDate() {
            const ts = this._parse(this.targetDate);
            if (!ts && this.targetDate !== null) {
                console.warn(`Countdown: Invalid targetDate provided: ${this.targetDate}`);
                return null;
            }
            return ts;
        }

        // Calculate time remaining
        calculateTimeLeft() {
            if (!this.targetTimestamp) return null;

            const now = TimerManager.getTime();
            const difference = this.targetTimestamp - now;

            if (difference <= 0) {
                return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, isSoon: false, progress: 100 };
            }

            let progress = null;
            if (this.startTime !== null && this.startTime !== undefined) {
                const startTs = this._parse(this.startTime);
                const endTs = this.targetTimestamp;

                // If we have a startAt and we're in the active phase, progress should be relative to startAt
                let effectiveStart = startTs;
                if (this.startAt) {
                    const startAtTs = this._parse(this.startAt);
                    if (startAtTs && now >= startAtTs) {
                        effectiveStart = startAtTs;
                    }
                }

                if (effectiveStart !== null) {
                    const totalDuration = endTs - effectiveStart;
                    if (totalDuration > 0) {
                        const elapsed = now - effectiveStart;
                        progress = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
                    }
                }
            }

            return {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
                total: difference,
                isSoon: difference > 0 && difference < 60 * 60 * 1000, // Less than 1 hour
                progress: progress
            };
        }

        // Initialize the countdown
        mount(selector) {
            if (selector) {
                this.container = typeof selector === 'string'
                    ? document.querySelector(selector)
                    : selector;
            }

            if (!this.container && !this.headless) {
                console.error(`Countdown: Element not found for selector: ${selector}`);
                return this;
            }

            // Parse target date
            this.targetTimestamp = this.parseTargetDate();
            if (!this.targetTimestamp) {
                if (this.container) this.container.innerHTML = '';
                return this;
            }

            // Reset ended state for new target
            this.hasEndedCalled = false;

            // Subscribe to timer updates
            this.unsubscribe = TimerManager.subscribe(() => this.update());

            // Initial render
            this.mounted = true;
            this.update();

            return this;
        }

        // Update the display
        update() {
            if (!this.mounted) return;

            const now = TimerManager.getTime();

            // Handle Start Window
            if (this.startAt) {
                const startTs = new Date(this.startAt).getTime();
                if (now < startTs) {
                    if (this.container) this.renderUpcoming(startTs - now);
                    return;
                } else if (!this.hasStartedCalled) {
                    this.hasStartedCalled = true;
                    if (typeof this.onStart === 'function') {
                        try { this.onStart(); } catch (e) { console.error('Countdown onStart error:', e); }
                    }
                }
            }

            this.timeLeft = this.calculateTimeLeft();

            // Handle Tick callback
            if (this.timeLeft && typeof this.onTick === 'function') {
                try { this.onTick(this.timeLeft); } catch (e) { console.error('Countdown onTick error:', e); }
            }

            // Handle ended state
            if (this.timeLeft && this.timeLeft.total <= 0) {
                if (this.container) {
                    if (this.endLabel === null) {
                        this.container.innerHTML = '';
                    } else {
                        this.container.innerHTML = `
                            <span class="countdown-ended ${this.className}">
                                ${this.showIcon ? Icons.Clock(12) : ''}
                                <span class="countdown-label">${escapeHtml(this.endLabel)}</span>
                            </span>
                        `;
                    }
                }

                // Trigger onEnd callback once
                if (!this.hasEndedCalled) {
                    this.hasEndedCalled = true;
                    if (typeof this.onEnd === 'function') {
                        try { this.onEnd(); } catch (e) { console.error('Countdown onEnd error:', e); }
                    }
                }
                return;
            }

            if (!this.timeLeft) return;

            // Render countdown
            if (this.container) this.render();
        }

        renderUpcoming(diff) {
            const now = TimerManager.getTime();
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            let timeStr = '';
            if (days > 0) timeStr = `${days}d ${hours}h`;
            else if (hours > 0) timeStr = `${hours}h ${minutes}m`;
            else timeStr = `${minutes}m`;

            let progressHtml = '';
            if (this.showProgress && this.startTime !== null) {
                // If targetDate is the start goal (Opens in), progress is startTime -> targetDate
                // If startAt is provided, progress is startTime -> startAt
                const goalTs = this._parse(this.startAt) || this.targetTimestamp;
                const createdTs = this._parse(this.startTime);

                if (goalTs !== null && createdTs !== null) {
                    const totalWait = goalTs - createdTs;
                    const elapsed = now - createdTs;
                    if (totalWait > 0) {
                        const progress = Math.max(0, Math.min(100, (elapsed / totalWait) * 100));
                        let stateClass = 'progress-ok';
                        if (progress > 75) stateClass = 'progress-critical';
                        else if (progress > 50) stateClass = 'progress-warn';

                        progressHtml = `
                            <div class="countdown-progress-container mt-5">
                                <div class="countdown-progress-fill ${stateClass}" style="width: ${progress}%"></div>
                            </div>
                        `;
                    }
                }
            }

            this.container.innerHTML = `
                <div class="countdown-upcoming-wrapper">
                    <div class="countdown-upcoming inline-flex items-center gap-1 ${this.className}">
                        ${this.showIcon ? Icons.Clock(12) : ''}
                        <span class="small-text">${escapeHtml(this.upcomingLabel)} ${timeStr}</span>
                    </div>
                    ${progressHtml}
                </div>
            `;
        }

        // Render the countdown UI
        render() {
            const { days, hours, minutes, seconds, isSoon, progress } = this.timeLeft;
            const iconSize = this.compact ? 14 : 18;

            const timeClasses = [
                'countdown-display',
                'inline-flex',
                'items-center',
                'gap-2',
                isSoon ? 'countdown-soon' : 'countdown-normal',
                this.className
            ].filter(Boolean).join(' ');

            let progressHtml = '';
            if (this.showProgress && progress !== null) {
                let stateClass = 'progress-ok';
                // URGENCE COLORS: Grow from 0 to 100.
                // 0-50: OK (Green)
                // 50-75: WARN (Yellow)
                // 75-100: CRITICAL (Red)
                if (progress > 75) stateClass = 'progress-critical';
                else if (progress > 50) stateClass = 'progress-warn';

                progressHtml = `
                    <div class="countdown-progress-container mt-5">
                        <div class="countdown-progress-fill ${stateClass}" style="width: ${progress}%"></div>
                    </div>
                `;
            }

            let html = `
                <div class="countdown-wrapper">
                    ${this.label ? `<div class="countdown-label small bold mb-5">${escapeHtml(this.label)}</div>` : ''}
                    <div class="${timeClasses}">
                        ${this.showIcon ? Icons.Clock(iconSize) : ''}
                        <div class="countdown-values flex gap-1 font-mono font-bold text-sm md:text-base">
            `;

            // Days (only show if > 0)
            if (days > 0) {
                html += `
                    <div class="countdown-unit flex flex-col items-center">
                        <span>${days}${this.compact ? 'd' : ''}</span>
                        ${!this.compact ? '<span class="text-[8px] uppercase tracking-tighter -mt-1 opacity-60">Days</span>' : ''}
                    </div>
                `;
            }

            // Hours (show if > 0 or days > 0)
            if (days > 0 || hours > 0) {
                html += `
                    <div class="countdown-unit flex flex-col items-center">
                        <span>${hours.toString().padStart(2, '0')}${this.compact ? 'h' : ''}</span>
                        ${!this.compact ? '<span class="text-[8px] uppercase tracking-tighter -mt-1 opacity-60">Hrs</span>' : ''}
                    </div>
                `;
            }

            // Minutes (always show)
            html += `
                <div class="countdown-unit flex flex-col items-center">
                    <span>${minutes.toString().padStart(2, '0')}${this.compact ? 'm' : ''}</span>
                    ${!this.compact ? '<span class="text-[8px] uppercase tracking-tighter -mt-1 opacity-60">Min</span>' : ''}
                </div>
            `;

            // Seconds (always show)
            html += `
                <div class="countdown-unit flex flex-col items-center">
                    <span>${seconds.toString().padStart(2, '0')}${this.compact ? 's' : ''}</span>
                    ${!this.compact ? '<span class="text-[8px] uppercase tracking-tighter -mt-1 opacity-60">Sec</span>' : ''}
                </div>
            `;

            html += `
                        </div>
                    </div>
                    ${progressHtml}
                </div>
            `;

            this.container.innerHTML = html;
        }

        // Update target date dynamically
        setTargetDate(newDate) {
            this.targetDate = newDate;
            this.targetTimestamp = this.parseTargetDate();
            this.hasEndedCalled = false;
            if (this.mounted) {
                this.update();
            }
        }

        // Update options dynamically
        setOptions(options) {
            Object.keys(options).forEach(key => {
                if (key in this && key !== 'container' && key !== 'unsubscribe') {
                    this[key] = options[key];
                }
            });
            if (this.mounted) {
                this.update();
            }
        }

        // Cleanup
        destroy() {
            if (this.unsubscribe) {
                this.unsubscribe();
                this.unsubscribe = null;
            }
            if (this.container) {
                this.container.innerHTML = '';
            }
            this.mounted = false;
        }

    }

    // ============================================
    // STATIC HELPER: Create countdown instances
    // ============================================
    Countdown.create = function(selector, options) {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;

        if (el && CountdownRegistry.has(el)) {
            CountdownRegistry.get(el).destroy();
        }

        const instance = new Countdown({ ...options, selector: el });
        if (el) {
            CountdownRegistry.set(el, instance);
        }
        return instance;
    };

    Countdown.createAll = function(selector, options) {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map(el => {
            if (CountdownRegistry.has(el)) {
                CountdownRegistry.get(el).destroy();
            }
            const instance = new Countdown({ ...options, selector: el });
            CountdownRegistry.set(el, instance);
            return instance;
        });
    };

    // ============================================
    // EXPORT TO GLOBAL
    // ============================================
    global.TimerManager = TimerManager;
    global.Countdown = Countdown;

    // AMD / CommonJS support
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Countdown, TimerManager };
    }

})(typeof window !== 'undefined' ? window : this);
