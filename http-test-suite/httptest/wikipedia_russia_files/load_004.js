mw.loader.implement("ext.Experiments.lib", function () {
    (function ($, window) {
        'use strict';
        $.fn.stall = function (etype, callback, timeout) {
            timeout = timeout || 600;
            $(this).one(etype, function (e) {
                var stalled = $.Deferred();
                stalled.always(function () {
                    var evt;
                    if (typeof e.target.dispatchEvent != 'undefined') {
                        evt = document.createEvent('Events');
                        evt.initEvent(etype, true, true);
                        e.target.dispatchEvent(evt);
                    }
                    if (evt === undefined || evt.eventPhase <= 2) {
                        if (typeof e.target.fireEvent != 'undefined') {
                            e.target.fireEvent('on' + etype);
                        } else {
                            e.target[etype]();
                        }
                    }
                });
                window.setTimeout(stalled.reject, timeout);
                try {
                    $.when(callback.apply(this, arguments)).then(stalled.resolve);
                } catch (err) {
                    stalled.reject(err);
                    throw err;
                }
                return false;
            });
            return this;
        };
    }(jQuery, window));
    (function (window, document, mw) {
        "use strict";
        var WIKI_EPOCH = 1008460800000;
        var e3 = mw.e3 = mw.e3 || {};
        e3.isEditInterface = function () {
            return (mw.config.get('wgAction') == 'edit' || mw.config.get('wgAction') == 'submit');
        };
        e3.isUserOptedOut = function () {
            return !!mw.user.options.get(
                'vector-noexperiments');
        };
        e3.getBuckets = function () {
            var buckets = {};
            var cookie = $.cookie('userbuckets');
            if (cookie === null) {
                return buckets;
            }
            try {
                buckets = $.parseJSON(cookie);
            } catch (e) {
                if (e instanceof SyntaxError) {
                    $.cookie('userbuckets', null);
                    return buckets;
                }
                throw e;
            }
            return buckets;
        };
        e3.getUserRegistrationDate = function () {
            var regDate = e3.parseDbDate(mw.config.get('wgRegistration'));
            if (regDate < WIKI_EPOCH) {
                return null;
            }
            return regDate;
        };
        e3.parseDbDate = function (dbDate) {
            if (!dbDate) {
                return null;
            }
            dbDate = dbDate.toString();
            if (dbDate.length !== 14) {
                return null;
            }
            return Date.UTC(parseInt(dbDate.slice(0, 4), 10), parseInt(dbDate.slice(4, 6), 10) - 1, parseInt(dbDate.slice(6, 8), 10), parseInt(dbDate.slice(8, 10), 10), parseInt(dbDate.slice(10, 12), 10), parseInt(dbDate.slice(12, 14), 10));
        };
        e3.hoursToMs = function (hours) {
            return hours * 36e5;
        };
        e3.daysToMs = function (days) {
            return days * 864e5;
        };
    }(window, document, mediaWiki));
    ;
}, {}, {});
mw.loader.implement("ext.UserBuckets", function () {
    (function ($) {
        $.getBuckets = function (force) {
            if (typeof $.userBuckets == 'undefined' || force) {
                $.userBuckets = $.parseJSON($.cookie('userbuckets'));
            }
            return $.userBuckets;
        };
        $.setBucket = function (bucketName, bucketValue, bucketVersion) {
            var bucketCookies = $.getBuckets();
            if (!bucketCookies) {
                bucketCookies = {};
            }
            bucketCookies[bucketName] = [bucketValue, bucketVersion];
            $.cookie('userbuckets', $.toJSON(bucketCookies), {expires: 365});
            bucketCookies = $.getBuckets(true);
            $(document).trigger('bucket.mediawiki', {bucket: bucketName, value: bucketValue, version: bucketVersion});
        };
        $.setupActiveBuckets = function () {
            var buckets = $.getBuckets();
            for (var iter in mw.activeCampaigns) {
                var campaign = mw.activeCampaigns[iter];
                if (campaign.all) {
                    campaign.all();
                }
                if (campaign.preferences && !campaign.preferences.setBuckets) {
                    continue;
                }
                if (!buckets || !buckets[campaign.name] || buckets[campaign.name][1] < campaign.version) {
                    var bucketTotal = 0;
                    for (var rate in campaign.rates) {
                        bucketTotal += campaign.rates[rate];
                    }
                    var currentUser = Math.floor(Math.random() * (bucketTotal + 1));
                    var prev_val = -1;
                    var next_val = 0;
                    for (rate in campaign.rates) {
                        next_val += campaign.rates[rate];
                        if (prev_val <= currentUser && currentUser < next_val) {
                            $.setBucket(campaign.name, rate, campaign.version);
                            break;
                        }
                        prev_val = next_val;
                    }
                }
                if ($.getBuckets() && $.getBuckets()[campaign.name]) {
                    var campaignBucket = $.getBuckets()[campaign.name][0];
                    if (campaignBucket != 'none') {
                        var func = campaign[campaignBucket];
                        if ($.isFunction(func)) {
                            func();
                        }
                        if (campaign.allActive) {
                            campaign.allActive();
                        }
                    }
                }
            }
        };
        if (mw.activeCampaigns && !$.isEmptyObject(mw.activeCampaigns)) {
            $($.setupActiveBuckets);
        }
    })(jQuery);
    ;
}, {}, {});
mw.loader.implement("ext.eventLogging", function () {
    (function (mw, $, console) {
        'use strict';

        function ValidationError(message) {
            this.message = message;
        }

        ValidationError.prototype = new Error();
        var self = mw.eventLog = {
            schemas: {},
            warn: console && $.isFunction(console.warn) ? $.proxy(console.warn, console) : mw.log,
            declareSchema: function (schemaName, meta) {
                if (self.schemas.hasOwnProperty(schemaName)) {
                    self.warn('Clobbering existing "' + schemaName + '" schema');
                }
                self.schemas[schemaName] = $.extend(true, {
                    revision: -1,
                    schema: {properties: {}}, defaults: {}
                }, self.schemas[schemaName], meta);
                return self.schemas[schemaName];
            },
            isInstanceOf: function (value, type) {
                if (value === undefined || value === null) {
                    return false;
                }
                switch (type) {
                    case'string':
                        return typeof value === 'string';
                    case'timestamp':
                        return value instanceof Date || (typeof value === 'number' && value >= 0 && value % 1 === 0);
                    case'boolean':
                        return typeof value === 'boolean';
                    case'integer':
                        return typeof value === 'number' && value % 1 === 0;
                    case'number':
                        return typeof value === 'number' && isFinite(value);
                    default:
                        return false;
                }
            },
            isValid: function (event, schemaName) {
                try {
                    self.assertValid(event, schemaName);
                    return true;
                } catch (e) {
                    if (!(e instanceof ValidationError)) {
                        throw e;
                    }
                    self.warn(e.message);
                    return false;
                }
            },
            assertValid: function (event, schemaName) {
                var schema = self.schemas[schemaName] || null, props = schema.schema.properties, prop;
                if ($.isEmpty(props)) {
                    throw new ValidationError('Unknown schema: ' + schemaName);
                }
                for (prop in event) {
                    if (props[prop] === undefined) {
                        throw new ValidationError('Unrecognized property: ' +
                            prop);
                    }
                }
                $.each(props, function (prop, desc) {
                    var val = event[prop];
                    if (val === undefined) {
                        if (desc.required) {
                            throw new ValidationError('Missing property: ' + prop);
                        }
                        return true;
                    }
                    if (!(self.isInstanceOf(val, desc.type))) {
                        throw new ValidationError('Wrong type for property: ' + prop + ' ' + val);
                    }
                    if (desc['enum'] && $.inArray(val, desc['enum']) === -1) {
                        throw new ValidationError('Value "' + val + '" not in enum ' + $.toJSON(desc['enum']));
                    }
                });
                return true;
            },
            setDefaults: function (schemaName, schemaDefaults) {
                var schema = self.schemas[schemaName];
                if (schema === undefined) {
                    self.warn('Setting defaults on unknown schema "' + schemaName + '"');
                    schema = self.declareSchema(schemaName);
                }
                return $.extend(true, schema.defaults, schemaDefaults);
            },
            encapsulate: function (schemaName, event) {
                var schema = self.schemas[schemaName];
                if (schema === undefined) {
                    self.warn('Got event with unknown schema "' + schemaName + '"');
                    schema = self.declareSchema(schemaName);
                }
                event = $.extend(true, {}, event, schema.defaults);
                return {
                    event: event,
                    clientValidated: self.isValid(event, schemaName),
                    revision: schema.revision,
                    schema: schemaName,
                    webHost: window.location.hostname,
                    wiki: mw.config.get('wgDBname')
                };
            },
            dispatch: function (data) {
                var beacon = document.createElement('img'), baseUri = mw.config.get('wgEventLoggingBaseUri'),
                    dfd = $.Deferred();
                if (!baseUri) {
                    dfd.rejectWith(data, [data]);
                    return dfd.promise();
                }
                $(beacon).on('error', function () {
                    dfd.resolveWith(data, [data]);
                });
                beacon.src = baseUri + '?' + encodeURIComponent($.toJSON(data)) + ';';
                return dfd.promise();
            },
            logEvent: function (schemaName, eventInstance) {
                return self.dispatch(self.encapsulate(schemaName, eventInstance));
            }
        };
        self.setSchema = self.declareSchema;
        if (!mw.config.get('wgEventLoggingBaseUri')) {
            self.warn('"$wgEventLoggingBaseUri" is not set.');
        }
    }(mediaWiki, jQuery, window.console));
    ;
}, {}, {});
mw.loader.implement("ext.markAsHelpful", function () {
    (function ($, mw) {
        var mah = mw.markAsHelpful = {
            loadedItems: [], selector: '[class^="markashelpful"]', init: function () {
                var props, thisItem;
                $(mah.selector).each(function (i, el) {
                    props = mah.getItemProperties($(el));
                    thisItem =
                        props.type + props.item;
                    if ($.inArray(thisItem, mah.loadedItems) === -1) {
                        mah.loadedItems.push(thisItem);
                        mah.loadItem($(el));
                    }
                });
            }, getItemProperties: function ($item) {
                var tag, props;
                tag = $item.attr('class');
                props = {item: tag.split('-')[2], type: tag.split('-')[1]};
                return props;
            }, loadItem: function ($item) {
                var props, request;
                props = mah.getItemProperties($item);
                request = {
                    format: 'json',
                    action: 'getmarkashelpfulitem',
                    item: props.item,
                    type: props.type,
                    page: mw.config.get('wgPageName')
                };
                $.ajax({
                    type: 'POST',
                    url: mw.util.wikiScript('api'),
                    cache: false,
                    data: request,
                    success: function (data) {
                        var $content;
                        if (data.getmarkashelpfulitem && data.getmarkashelpfulitem.result === 'success' && data.getmarkashelpfulitem.formatted) {
                            $content = $(data.getmarkashelpfulitem.formatted);
                            $item.html($content);
                        }
                    },
                    error: function () {
                    },
                    dataType: 'json'
                });
            }, markItem: function ($clicked, action) {
                var $item, props, clientData, request;
                $item = $clicked.parent().parent();
                props = mah.getItemProperties($item);
                clientData = $.client.profile();
                props.mahaction = action;
                request = $.extend({
                    action: 'markashelpful',
                    format: 'json',
                    page: mw.config.get('wgPageName'),
                    useragent: clientData.name + '/' + clientData.versionNumber,
                    system: clientData.platform,
                    token: mw.user.tokens.get('editToken')
                }, props);
                $.ajax({
                    type: 'post', url: mw.util.wikiScript('api'), data: request, success: function () {
                        mah.loadItem($item);
                    }, dataType: 'json'
                });
            }
        };
        $(document).ready(function () {
            $('.markashelpful-mark').live('click', function () {
                mah.markItem($(this), 'mark');
            });
            $('.markashelpful-undo').live('click', function () {
                mah.markItem($(this), 'unmark');
            });
            mah.init();
        });
    }(jQuery, mediaWiki));
    ;
}, {
    "css": [
        ".mw-mah-wrapper a{cursor:pointer}.mw-mah-wrapper .mah-helpful-state{background:transparent url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAwFBMVEX///+AgICzs7OioqLS0tK9vb3e3t6ioqLe3t6lpaXe3t6ioqLS0tLX19fb29vS0tK4uLjb29u4uLjb29vb29vX19fNzc2urq7Dw8Ourq6urq6pqampqamlpaXNzc3JycmlpaXJycnDw8Ourq7JycnNzc3S0tKzs7O4uLje3t6NjY10dHSioqKurq52dnZ4eHi+vr7MzMyKioqVlZVra2t6enqlpaXb29t9fX3X19eHh4e7u7u9vb3Dw8NwcHCpqamjqutxAAAAJHRSTlMAAISB8/mHydjeGAwVVPYb0l3P81Raihjz8BJUTkiE2z/P+fOmaXKeAAAAlklEQVR4XmXP1Q6DQBCG0S4udXddQ+tu7/9W/QuEkPBdzE7O1WylHCHEMSzPswwHawKt+jWp002hd8+r/aGhcf7kaMe5VgX0GWMnhj57xuaABaX0SLOxAqzfhYYA/VVIBzSlPPsS+Tcp2wBFCBE/hDjEWBTAYBNF0TYIYjyjMYBMvnnT9PSZfUmylyQF4qpmGJqqSwClfm4rG35BO7jwAAAAAElFTkSuQmCC) no-repeat left center;background:transparent url(//bits.wikimedia.org/static-1.21wmf11/extensions/MarkAsHelpful/modules/ext.markAsHelpful/images/mah-helpful-dull.png?2013-03-04T18:36:40Z) no-repeat left center!ie;padding-left:18px}.mw-mah-wrapper .mah-helpful-state:hover{background:transparent url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABpFBMVEX///+AgIBknYBYmXlknYBhnH5dmntYmXlhnH5Ul3VknYBhnH5hnH5dmntKlG5YmXlKlG5FkmpUl3VknYBknYBFkmpAkGdPlXJAkGc7jmRYmXk7jmQ3jWE3jWFknYA3jWE3jWEzi14zi14zi14wilwwilxPlXIwilwwilwuiVsuiVsuiVsuiVsuiVsuiVsuiVtkvpFmpYUzlGNqsY0xjV9SuoZhwpENIhhmwZNgrYUmVj1asoViooFprotop4diqoZDmG04mGdRuIQ6oGwKEQ1VqX4iUjlPp3pTkHJcpoBruZIPJho/onBdoX9euotgv45joIFdmntXuIZZvYpbwIxknYBovJFTsYFKs31doH4LEw9KnHJEpHNBnG08kWZZqIBqtpBduYo6lGY9nGw/o3EQKh1esogSKR1mqYZBnG5Wm3hIo3UPJRo9kmZqv5M8nGw5k2ZWmndpto9Rt4Qzi142k2NZqYE6nmsvWUQ5nWo1kmMVMCJIonRDl21KnXIuV0IzkmFQnnYykWFdsYdTnnhEpXMOIhggTDVPnnZmqodTnXhpvpMpx75iAAAAL3RSTlMAABLthPZOEmB41fNUXfkb6vmHGNvq29vMivN4G/OH7RJd/E5a88nwThiEzMaBEgXD7vYAAADdSURBVHheZc7DlgNRFIXhvqHRts1CbNu22bZtvXROUsP8o72+0e7rDSE0ODMUj/MYNJhd4DBDhMFAhPgCCoRh3a9eKtW3dGFWB8QTfqOr5PGcuYxpOhtgYM+tziSO/hM2tfuUCzD6cdW4wVUq/Pm9+LcCIHq1awNBhSJY1tp/JAD9T85kJBqLRSNJZ3YYYMS039RY5PJzzf3D4xjA+OHu59d3KuU4yOULkwBT05Vqra5Uen3HJ7NzAGj+4tJ8bbXemu8WFqnrS8uyF5J8k62uIQrQ+sYmhm1t7yCAntoIMi7vn1V0QgAAAABJRU5ErkJggg==) no-repeat left center;background:transparent url(//bits.wikimedia.org/static-1.21wmf11/extensions/MarkAsHelpful/modules/ext.markAsHelpful/images/mah-helpful-hover.png?2013-03-04T18:36:40Z) no-repeat left center!ie}.mw-mah-wrapper .mah-helpful-marked-state{background:transparent url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAzFBMVEX///+AgICB0KiF0qtAuHtOvYWF0qt4zaFAuHtEun6F0qt9z6V9z6V4zaGB0KhgxJF4zaFgxJFZwYxsyJpyy51ZwYxTv4mB0KhOvYVyy51OvYVIu4FIu4FsyJpEun5Eun5AuHtmxpVTv4lmxpVAuHtsyJpyy51ZwYxTv4l4zaEQJhsrXUNAuHtOvYWF0qsSKR0ZNicVLiFfon9gpIEULyEJEQ0RKx4RJhyB0KhuxJdEun4FCgckUjszXkgmWUAwWUVmxpVgxJFIu4F9z6VRJyO9AAAAJXRSTlMAAPPYgfOH88lIGFpUG1r5FfPbz4TPh1cbhxVaVNvk3g/5hPAMT7vCKAAAAJhJREFUeF5lztUKw0AQhtFuVOru3rVY1V3e/536N4EQyAfDDOdqctkIIY6hhqFqODgjKCmnKKUdQ/6bVPhD0ZRyI9FWSrMC6DLGrgztz4w1AENK6Z2iJ6YOmL5SzQHld6oqoMb52uPIW3HeBLSEEMebEI8ljhmgowdBsHPdA5beA5D+J2kQv26PLlFjm8RAJprl+5a2IIBMPybPHPtdJtGCAAAAAElFTkSuQmCC) no-repeat left center;background:transparent url(//bits.wikimedia.org/static-1.21wmf11/extensions/MarkAsHelpful/modules/ext.markAsHelpful/images/mah-helpful-marked.png?2013-03-04T18:36:40Z) no-repeat left center!ie;padding-left:18px}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:4fbee07207531613fa0a8b9f679a0e82 */"
    ]
}, {});
mw.loader.implement("ext.navigationTiming", function () {
    (function (mw, $) {
        'use strict';
        var timing = window.performance ? performance.timing : null;

        function getRand(n) {
            return Math.floor(Math.random() * (n + 1));
        }

        function inSample() {
            var factor = mw.config.get('wgNavigationTimingSamplingFactor');
            if (!$.isNumeric(factor) || factor < 1) {
                return false;
            }
            return getRand(factor) === getRand(factor);
        }

        function emitTiming() {
            var event = {
                userAgent: navigator.userAgent,
                isHttps: location.protocol === 'https:',
                isAnon: mw.user.isAnon()
            }, page = {
                pageId: mw.config.get('wgArticleId'),
                revId: mw.config.get('wgCurRevisionId'),
                action: mw.config.get('wgAction')
            };
            if ($.isPlainObject(window.Geo) && typeof Geo.country === 'string') {
                event.originCountry = Geo.country;
            }
            $.each({
                dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
                connecting: timing.connectEnd - timing.connectStart,
                sending: timing.fetchStart - timing.navigationStart,
                waiting: timing.responseStart - timing.requestStart,
                receiving: timing.responseEnd - timing.responseStart,
                rendering: timing.loadEventEnd - timing.responseEnd
            }, function (k, v) {
                if ($.isNumeric(v) && v > 0) {
                    event[k] = v;
                }
            });
            if (timing.redirectStart) {
                event.redirectCount = performance.navigation.redirectCount;
                event.redirecting = timing.redirectEnd - timing.redirectStart;
            }
            if (page.revId) {
                $.extend(event, page);
            }
            mw.eventLog.logEvent('NavigationTiming', event);
        }

        if (timing && inSample()) {
            $(window).load(function () {
                setTimeout(emitTiming, 0);
            });
        }
    }(mediaWiki, jQuery));
    ;
}, {}, {});
mw.loader.implement("ext.postEdit", function () {
    (function (mw, $) {
        'use strict';
        var div, key = mw.config.get('wgCookiePrefix') + 'showPostEdit';

        function popCookie(key) {
            var val = $.cookie(key);
            if (val !== null) {
                $.cookie(key, null, {path: mw.config.get('wgCookiePath')});
            }
            return val;
        }

        function removeConfirmation(e) {
            div.firstChild.className = 'postedit postedit-faded';
            setTimeout(function () {
                $(div).remove();
            }, 500);
            if (e && e.preventDefault) {
                e.preventDefault();
            }
        }

        if (parseInt(popCookie(key), 10) === mw.config.get('wgArticleId')) {
            mw.config.set('wgPostEdit', true);
            div = document.createElement('div');
            div.className
                = 'postedit-container';
            div.innerHTML = '<div class="postedit">' + '<div class="postedit-icon postedit-icon-checkmark">' + mw.message('postedit-confirmation', mw.user).escaped() + '</div>' + '<a href="#" class="postedit-close">&times;</a>' + '</div>';
            $(document).ready(function () {
                $(div).find('.postedit-close').click(removeConfirmation);
                $('body').prepend(div);
                setTimeout(removeConfirmation, 3000);
            });
        }
    }(mediaWiki, jQuery));
    ;
}, {
    "css": [
        ".postedit-container{margin:0 auto;position:fixed;top:0;height:0;left:50%;z-index:1000}.postedit{position:relative;top:0.6em;left:-50%;padding:.6em 3.6em .6em 1.1em;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;font-size:0.8em;line-height:1.5625em;color:#626465;background:#eee url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAA0BAMAAABSu/SnAAAAHlBMVEXs7Oz19fX09PTy8vLu7u7t7e3w8PDz8/Pv7+/x8fEtYyu9AAAAIklEQVQIW2MQZECGSkiwHAqN4XAmFKZBYQcUusBhKByiAQCuTQ040z4WnQAAAABJRU5ErkJggg==) repeat-x;background:#eee url(//bits.wikimedia.org/static-1.21wmf11/extensions/PostEdit/resources/images/gray-bg.png?2013-03-04T18:36:40Z) repeat-x!ie;border:1px solid #dcd9d9;-webkit-text-shadow:0 0.0625em 0 rgba(255,255,255,0.5);-moz-text-shadow:0 0.0625em 0 rgba(255,255,255,0.5);text-shadow:0 0.0625em 0 rgba(255,255,255,0.5);-webkit-border-radius:5px;-moz-border-radius:5px;border-radius:5px;-webkit-box-shadow:0 2px 5px 0 #ccc;-moz-box-shadow:0 2px 5px 0 #ccc;box-shadow:0 2px 5px 0 #ccc;-webkit-transition:all 0.25s ease-in-out;-moz-transition:all 0.25s ease-in-out;-ms-transition:all 0.25s ease-in-out;-o-transition:all 0.25s ease-in-out;transition:all 0.25s ease-in-out}.postedit-faded{opacity:0}.postedit-icon{padding-left:41px;  line-height:25px;background-repeat:no-repeat;background-position:8px 50%}.postedit-icon-checkmark{background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABblBMVEUAAAD///////9PfTf///80aRdTgjn///9Feij///////////9Rfzf///////////9PfjZRgDh1o1xOfTb///////+bwYqLtnj///////9PfTa82K////9WhT6YxIL///9QgDdTgzr////////j7uDl7eLq8efi693k7OH///////9UhjuBr2rp9uRUhjr///9YljVKgir///9WiTlYjT3////9/v57vFlbkT5PjC9dlD/5/fhuq09stUTs9uhxuElctCpfnT1huDFloEZloUZmpENmvDZpvDxpvTxqvjxrvT5rvT9rwTxsqktswD5uwkBvuUdxw0NztFBztU9ztVBzwkp0tlJ1xkd2t1R3uVR4w1F4xk54x014yE15uVZ5v1R5xVB6v1R7yFJ8wVh9xVl9yFR9yVd9ylN+xVh+yFd/x1l/yFeAylmEx1+Ny2uY0Hqe04Wj1Ymv3Ze33qLD47TJ5L3O6cPU7Mrq9eb2+/Q4j37OAAAAQHRSTlMAAQIEBAUFBQwPFB4fJCUoKiosQEhJS01RUlZZXmdydXaChYuSlJSWmJmoq6uur8LExcvM19fg5ejt8fX2+Pr7SljgewAAAKpJREFUGBkFwQNCAwAAAMDLtl3LtrG4rWXbtvX77gAgZ6grFwC0bhwNVgKgdPZx8b0dgLi+s7Wn0VoAqpfOI9+BNADZI7fLrz2pSEwGHZuH+78lSK8ZLkLezF3ooyUG3VPXq2USei9WngeyoG195yBYWDF3E/2pAhl1e9Gr8bGT+bfOFCC2fnvh4X7rcqIAQNNu+HT6sxkAjceTL/2ZAIhv+PorBwBJxfkA//dFHSCBy/UTAAAAAElFTkSuQmCC);background-image:url(//bits.wikimedia.org/static-1.21wmf11/extensions/PostEdit/resources/images/green-checkmark.png?2013-03-04T18:36:40Z)!ie;background-position:left}.postedit-close{position:absolute;padding:0 .8em;right:0;top:0;font-size:1.25em;font-weight:bold;line-height:2.3em;color:black;text-shadow:0 0.0625em 0 white;text-decoration:none;opacity:0.2;filter:alpha(opacity=20)}.postedit-close:hover{color:black;text-decoration:none;cursor:pointer;opacity:0.4;filter:alpha(opacity=40)}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:314dda78dafa35b52aba2ee32c4d1171 */"
    ]
}, {"postedit-confirmation": "Your edit was saved."});
mw.loader.implement("ext.gadget.DRN-wizard", function () {
    if (mw.config.get('wgPageName') === 'Wikipedia:Dispute_resolution_noticeboard/request') {
        importScript('MediaWiki:Gadget-DRN-wizard.js');
    }
    ;
}, {}, {});
mw.loader.implement("ext.gadget.ReferenceTooltips", function () {
}, {
    "css": [
        ".referencetooltip{position:absolute;list-style:none;list-style-image:none;opacity:0;font-size:10px;margin:0;z-index:5;padding:0}.referencetooltip li{border:#080086 2px solid;max-width:260px;padding:10px 8px 13px 8px;margin:0px;background-color:#F7F7F7;box-shadow:2px 4px 2px rgba(0,0,0,0.3);-moz-box-shadow:2px 4px 2px rgba(0,0,0,0.3);-webkit-box-shadow:2px 4px 2px rgba(0,0,0,0.3)}.referencetooltip li+li{margin-left:7px;margin-top:-2px;border:0;padding:0;height:3px;width:0px;background-color:transparent;box-shadow:none;-moz-box-shadow:none;-webkit-box-shadow:none;border-top:12px #080086 solid;border-right:7px transparent solid;border-left:7px transparent solid}.referencetooltip\x3eli+li::after{content:\'\';border-top:8px #F7F7F7 solid;border-right:5px transparent solid;border-left:5px transparent solid;margin-top:-12px;margin-left:-5px;z-index:1;height:0px;width:0px;display:block}.client-js .referencetooltip li ul li{border:none;box-shadow:none;-moz-box-shadow:none;-webkit-box-shadow:none;height:auto;width:auto;margin:auto;padding:0;position:static}.RTflipped{padding-top:13px}.referencetooltip.RTflipped li+li{position:absolute;top:2px;border-top:0;border-bottom:12px #080086 solid}.referencetooltip.RTflipped li+li::after{border-top:0;border-bottom:8px #F7F7F7 solid;position:absolute;margin-top:7px}.RTsettings{float:right;height:16px;width:16px;cursor:pointer;background-image:url(//upload.wikimedia.org/wikipedia/commons/e/ed/Cog.png);margin-top:-9px;margin-right:-7px;-webkit-transition:opacity 0.15s;-moz-transition:opacity 0.15s;-o-transition:opacity 0.15s;-ms-transition:opacity 0.15s;transition:opacity 0.15s;opacity:0.6;filter:alpha(opacity=60)}.RTsettings:hover{opacity:1;filter:alpha(opacity=100)}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:f043a32bb7f4917227bd98422c2a56ec */"
    ]
}, {});
mw.loader.implement("ext.gadget.charinsert", function () {
    window.updateEditTools = function () {
    };
    jQuery(document).ready(function ($) {
        var EditTools = {
            charinsert: {
                'Insert': ' – — ° ″ ′ ≈ ≠ ≤ ≥ ± − × ÷ ← → · §  Sign_your_posts_on_talk_pages: ~~\~~  Cite_your_sources: <ref>+</ref>',
                'Wiki markup': 'Insert:  – — ° ″ ′ ≈ ≠ ≤ ≥ ± − × ÷ ← → · § ~~\~~ <ref>+</ref>  Wiki_markup:  {\{+}}  {\{\{+}}}  |  [+]  [\[+]]  [\[Category:+]]  #REDIRECT.[\[+]]  &nb' + 'sp;  <s>+</s>  <sup>+</sup>  <sub>+</sub>  <code>+</code>  <pre>+</pre>  <blockquote>+</blockquote>  <ref.name="+"_/>  {\{#tag:ref|+|group="nb"|name=""}}  {\{Reflist}}  <references./>  <includeonly>+</includeonly>  <noinclude>+</noinclude>  {\{DEFAULTSORT:+}}  <nowiki>+</nowiki>  <!--.+_-->  <span.class="plainlinks">+</span>',
                'Symbols':
                    '~ | ¡¿†‡↔↑↓•¶#∞  ‘+’ “+” ‹+› «+» ⟨+⟩  ¤₳฿₵¢₡₢$₫₯€₠₣ƒ₴₭₤ℳ₥₦№₧₰£៛₨₪৳₮₩¥  ♠♣♥♦  ♭♯♮  ©®™ ◌ {\{Unicode|+}}',
                'Latin':
                    'A a Á á À à Â â Ä ä Ǎ ǎ Ă ă Ā ā Ã ã Å å Ą ą Æ æ Ǣ ǣ  B b  C c Ć ć Ċ ċ Ĉ ĉ Č č Ç ç  D d Ď ď Đ đ Ḍ ḍ Ð ð  E e É é È è Ė ė Ê ê Ë ë Ě ě Ĕ ĕ Ē ē Ẽ ẽ Ę ę Ẹ ẹ Ɛ ɛ Ə ə  F f  G g Ġ ġ Ĝ ĝ Ğ ğ Ģ ģ  H h Ĥ ĥ Ħ ħ Ḥ ḥ  I i İ ı Í í Ì ì Î î Ï ï Ǐ ǐ Ĭ ĭ Ī ī Ĩ ĩ Į į Ị ị  J j Ĵ ĵ  K k Ķ ķ  L l Ĺ ĺ Ŀ ŀ Ľ ľ Ļ ļ Ł ł Ḷ ḷ Ḹ ḹ  M m Ṃ ṃ  N n Ń ń Ň ň Ñ ñ Ņ ņ Ṇ ṇ Ŋ ŋ  O o Ó ó Ò ò Ô ô Ö ö Ǒ ǒ Ŏ ŏ Ō ō Õ õ Ǫ ǫ Ọ ọ Ő ő Ø ø Œ œ  Ɔ ɔ  P p  Q q  R r Ŕ ŕ Ř ř Ŗ ŗ Ṛ ṛ Ṝ ṝ  S s Ś ś Ŝ ŝ Š š Ş ş Ș ș Ṣ ṣ ß  T t Ť ť Ţ ţ Ț ț Ṭ ṭ Þ þ  U u Ú ú Ù ù Û û Ü ü Ǔ ǔ Ŭ ŭ Ū ū Ũ ũ Ů ů Ų ų Ụ ụ Ű ű Ǘ ǘ Ǜ ǜ Ǚ ǚ Ǖ ǖ  V v  W w Ŵ ŵ  X x  Y y Ý ý Ŷ ŷ Ÿ ÿ Ỹ ỹ Ȳ ȳ  Z z Ź ź Ż ż Ž ž  ß Ð ð Þ þ Ŋ ŋ Ə ə  {\{Unicode|+}}',
                'Greek':
                    'ΆάΈέΉήΊίΌόΎύΏώ  ΑαΒβΓγΔδ  ΕεΖζΗηΘθ  ΙιΚκΛλΜμ  ΝνΞξΟοΠπ  ΡρΣσςΤτΥυ  ΦφΧχΨψΩω  ᾼᾳᾴᾺὰᾲᾶᾷἈἀᾈᾀἉἁᾉᾁἌἄᾌᾄἊἂᾊᾂἎἆᾎᾆἍἅᾍᾅἋἃᾋᾃἏἇᾏᾇ  ῈὲἘἐἙἑἜἔἚἒἝἕἛἓ  ῌῃῄῊὴῂῆῇἨἠᾘᾐἩἡᾙᾑἬἤᾜᾔἪἢᾚᾒἮἦᾞᾖἭἥᾝᾕἫἣᾛᾓἯἧᾟᾗ  ῚὶῖἸἰἹἱἼἴἺἲἾἶἽἵἻἳἿἷ  ῸὸὈὀὉὁὌὄὊὂὍὅὋὃ  ῤῬῥ  ῪὺῦὐὙὑὔὒὖὝὕὛὓὟὗ  ῼῳῴῺὼῲῶῷὨὠᾨᾠὩὡᾩᾡὬὤᾬᾤὪὢᾪᾢὮὦᾮᾦὭὥᾭᾥὫὣᾫᾣὯὧᾯᾧ   {\{Polytonic|+}}',
                'Cyrillic':
                    'АаБбВвГг  ҐґЃѓДдЂђ  ЕеЁёЄєЖж  ЗзЅѕИиІі  ЇїЙйЈјКк  ЌќЛлЉљМм  НнЊњОоПп  РрСсТтЋћ  УуЎўФфХх  ЦцЧчЏџШш  ЩщЪъЫыЬь  ЭэЮюЯя ӘәӨөҒғҖҗ ҚқҜҝҢңҮү ҰұҲҳҸҹҺһ  ҔҕӢӣӮӯҘҙ  ҠҡҤҥҪҫӐӑ  ӒӓӔӕӖӗӰӱ  ӲӳӸӹӀ  ҞҟҦҧҨҩҬҭ  ҴҵҶҷҼҽҾҿ  ӁӂӃӄӇӈӋӌ  ӚӛӜӝӞӟӠӡ  ӤӥӦӧӪӫӴӵ  ́',
                'Hebrew': 'אבגדהוזחטיךכלםמןנסעףפץצקרשת  ׳ ״  װױײ',
                'Arabic': '  Transcription: ʾ ṯ ḥ ḫ ẖ ḏ š ṣ ḍ ṭ ẓ ʿ ġ ẗ ا ﺁ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه ة و ي ى ء أ إ ؤ ئ',
                'IPA (English)': 'ˈ ˌ ŋ ɡ tʃ dʒ ʃ ʒ θ ð ʔ  iː ɪ uː ʊ ʌ ɜr eɪ ɛ æ oʊ ɒ ɔː ɔɪ ɔr ɑː ɑr aɪ aʊ  ə ər ɨ ɵ ʉ ⟨+⟩  {\{IPAc-en|+}} {\{IPA-en|+}} {\{IPA|/+/}}',
                'IPA':
                    't̪ d̪ ʈɖɟɡɢʡʔ  ɸβθðʃʒɕʑʂʐçʝɣχʁħʕʜʢɦ  ɱɳɲŋɴ  ʋɹɻɰ  ʙⱱʀɾɽ  ɫɬɮɺɭʎʟ  ʍɥɧ  ʼ ɓɗʄɠʛ  ʘǀǃǂǁ  ɨʉɯ ɪʏʊ øɘɵɤ ə ɚ ɛœɜɝɞʌɔ æ ɐɶɑɒ  ʰʱʷʲˠˤˀ ᵊ k̚ ⁿˡ  ˈˌːˑ t̪ d̪ s̺ s̻ θ̼ s̬ n̥ ŋ̊ a̤ a̰  β̞ ˕ r̝ ˔ o˞ ɚ ɝ e̘ e̙ u̟ i̠ ɪ̈ e̽ ɔ̹ ɔ̜ n̩ ə̆ ə̯ ə̃ ȷ̃ ɫ z̴ ə̋ ə́ ə̄ ə̀ ə̏ ə̌ ə̂ ə᷄ ə᷅ ə᷇ ə᷆ ə᷈ ə᷉ t͡ʃ d͡ʒ t͜ɬ ‿  ˥ ˦ ˧ ˨ ˩ ꜛ ꜜ | ‖ ↗ ↘  k͈ s͎ {\{IPA|+}}',
                'Math and logic': '− × ÷ ⋅ ° ∗ ∘ ± ∓ ≤ ≥ ≠ ≡ ≅ ≜ ≝ ≐ ≃ ≈ ⊕ ⊗ ⇐ ⇔ ⇒ ∞ ← ↔ → ≪ ≫ ∝ √ ∤ ≀ ◅ ▻ ⋉ ⋊ ⋈ ∴ ∵ ↦ ¬ ∧ ∨ ⊻ ∀ ∃ ∈ ∉ ∋ ⊆ ⊈ ⊊ ⊂ ⊄ ⊇ ⊉ ⊋ ⊃ ⊅ ∪ ∩ ∑ ∏ ∐ ′ ∫ ∬ ∭ ∮ ∇ ∂ ∆ ∅ ℂ ℍ ℕ ℙ ℚ ℝ ℤ ℵ ⌊ ⌋ ⌈ ⌉ ⊤ ⊥ ⊢ ⊣ ⊧ □ ∠ ⟨ ⟩ {\{frac|+|}} &nb' + 'sp; &minus; <math>+</math> {\{math|+}}'
            },
            charinsertDivider: "\240", cookieName: 'edittoolscharsubset', createEditTools: function (placeholder) {
                var sel, id;
                var box = document.createElement("div");
                var prevSubset = 0, curSubset = 0;
                box.id = "editpage-specialchars";
                box.title = 'Click on the character or tag to insert it into the edit window';
                if (window.charinsertCustom) {
                    for (id in charinsertCustom) {
                        if (!EditTools.charinsert[id]) {
                            EditTools.charinsert[id] = '';
                        }
                    }
                }
                sel = document.createElement('select');
                for (id in EditTools.charinsert) {
                    sel.options[sel.options.length] = new Option(id, id);
                }
                sel.selectedIndex = 0;
                sel.style.marginRight = '.3em';
                sel.title = 'Choose character subset';
                sel.onchange = sel.onkeyup = selectSubset;
                box.appendChild(sel);
                if (window.editToolsRecall) {
                    var recall = document.createElement('span');
                    recall.appendChild(document.createTextNode('↕'));
                    recall.onclick = function () {
                        sel.selectedIndex = prevSubset;
                        selectSubset();
                    }
                    with (recall.style) {
                        cssFloat = styleFloat = 'left';
                        marginRight = '5px';
                        cursor = 'pointer';
                    }
                    box.appendChild(recall);
                }
                try {
                    var cookieRe = new RegExp("(?:^|;)\\s*" + EditTools.cookieName + "=(\\d+)\\s*(?:;|$)");
                    var m = cookieRe.exec(document.cookie);
                    if (m && m.length > 1 && parseInt(m[1]) < sel.options.length) {
                        sel.selectedIndex = parseInt(m[1]);
                    }
                } catch (err) {
                }
                placeholder.parentNode.replaceChild(box, placeholder);
                selectSubset();
                return;

                function selectSubset() {
                    prevSubset = curSubset;
                    curSubset = sel.selectedIndex;
                    try {
                        var expires = new Date();
                        expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
                        document.cookie = EditTools.cookieName + "=" + curSubset + ";path=/;expires=" + expires.toUTCString();
                    } catch (err) {
                    }
                    var pp = box.getElementsByTagName('p');
                    for (var i = 0; i < pp.length; i++) {
                        pp[i].style.display = 'none';
                    }
                    var id = sel.options[curSubset].value;
                    var p = document.getElementById(id);
                    if (!p) {
                        p = document.createElement('p');
                        p.id = id;
                        if (id == 'Arabic' || id == 'Hebrew') {
                            p.style.fontSize = '120%';
                            p.dir = 'rtl';
                        }
                        var tokens = EditTools.charinsert[id];
                        if (window.charinsertCustom
                            && charinsertCustom[id]) {
                            if (tokens.length > 0) {
                                tokens += ' ';
                            }
                            tokens += charinsertCustom[id];
                        }
                        EditTools.createTokens(p, tokens);
                        box.appendChild(p);
                    }
                    p.style.display = 'inline';
                }
            }, createTokens: function (paragraph, str) {
                var tokens = str.split(' '), token, i, n;
                for (i = 0; i < tokens.length; i++) {
                    token = tokens[i];
                    n = token.indexOf('+');
                    if (token == '' || token == '_') {
                        addText(EditTools.charinsertDivider + ' ');
                    } else if (token == '\n') {
                        paragraph.appendChild(document.createElement('br'));
                    } else if (token == '___') {
                        paragraph.appendChild(document.createElement('hr'));
                    } else if (token.charAt(token.length - 1) == ':') {
                        addBold(token);
                    } else if (n == 0) {
                        addLink(token.substring(1), '</' + token.substring(2), token.substring(1));
                    } else if (n > 0) {
                        addLink(token.substring(0, n), token.substring(n + 1));
                    } else if (token.length > 2 && token.charCodeAt(0) > 127) {
                        for (var j = 0; j < token.length; j++) {
                            addLink(token.charAt(j), '');
                        }
                    } else {
                        addLink(token, '');
                    }
                }
                return;

                function addLink(tagOpen, tagClose, name) {
                    var handler;
                    var dle = tagOpen.indexOf('\x10');
                    if (dle > 0) {
                        var path = tagOpen.substring(
                            dle + 1).split('.');
                        tagOpen = tagOpen.substring(0, dle);
                        var handler = window;
                        for (var i = 0; i < path.length; i++) {
                            handler = handler[path[i]];
                        }
                    } else {
                        tagOpen = tagOpen.replace(/\./g, ' ');
                        tagClose = tagClose ? tagClose.replace(/_/g, ' ') : '';
                        handler = new Function("evt", "insertTags('" + tagOpen + "', '" + tagClose + "', ''); return killEvt( evt );");
                    }
                    var a = document.createElement('a');
                    name = name || tagOpen + tagClose;
                    name = name.replace(/\\n/g, '');
                    a.appendChild(document.createTextNode(name));
                    a.href = "#";
                    addHandler(a, 'click', handler);
                    paragraph.appendChild(a);
                    addText(' ');
                }

                function addBold(text) {
                    var b = document.createElement('b');
                    b.appendChild(document.createTextNode(text.replace(/_/g, ' ')));
                    paragraph.appendChild(b);
                    addText(' ');
                }

                function addText(txt) {
                    paragraph.appendChild(document.createTextNode(txt));
                }
            }, enableForAllFields: function () {
                if (typeof (insertTags) != 'function' || window.WikEdInsertTags) {
                    return;
                }
                var texts = document.getElementsByTagName('textarea');
                for (var i = 0; i < texts.length; i++) {
                    addHandler(texts[i], 'focus', EditTools.registerTextField);
                }
                texts = document.getElementsByTagName('input');
                for (var i = 0; i < texts.length; i++) {
                    if (texts[i].type == 'text') {
                        addHandler(texts[i], 'focus', EditTools.registerTextField);
                    }
                }
                insertTags = EditTools.insertTags;
            }, last_active_textfield: null, registerTextField: function (evt) {
                var e = evt || window.event;
                var node = e.target || e.srcElement;
                if (!node) {
                    return;
                }
                EditTools.last_active_textfield = node.id;
                return true;
            }, getTextArea: function () {
                var txtarea = null;
                if (EditTools.last_active_textfield && EditTools.last_active_textfield != "") txtarea = document.getElementById(EditTools.last_active_textfield);
                if (!txtarea) {
                    if (document.editform) {
                        txtarea = document.editform.wpTextbox1;
                    } else {
                        txtarea = document.getElementsByTagName('textarea');
                        if (txtarea.length > 0) {
                            txtarea = txtarea[0];
                        } else {
                            txtarea = null;
                        }
                    }
                }
                return txtarea;
            }, insertTags: function (tagOpen, tagClose, sampleText) {
                var txtarea = EditTools.getTextArea();
                if (!txtarea) {
                    return;
                }
                if (typeof $j != 'undefined' && typeof $j.fn.textSelection != 'undefined') {
                    $j(txtarea).textSelection(
                        'encapsulateSelection', {'pre': tagOpen, 'peri': sampleText, 'post': tagClose});
                    return;
                }
                var selText, isSample = false;

                function checkSelectedText() {
                    if (!selText) {
                        selText = sampleText;
                        isSample = true;
                    } else if (selText.charAt(selText.length - 1) == ' ') {
                        selText = selText.substring(0, selText.length - 1);
                        tagClose += ' ';
                    }
                }

                if (document.selection && document.selection.createRange) {
                    var winScroll = 0;
                    if (document.documentElement && document.documentElement.scrollTop) {
                        winScroll = document.documentElement.scrollTop;
                    } else if (document.body) {
                        winScroll = document.body.scrollTop;
                    }
                    txtarea.focus();
                    var range = document.selection.createRange();
                    selText = range.text;
                    checkSelectedText();
                    range.text = tagOpen + selText + tagClose;
                    if (isSample && range.moveStart) {
                        if (window.opera) {
                            tagClose = tagClose.replace(/\n/g, "");
                        }
                        range.moveStart('character', -tagClose.length - selText.length);
                        range.moveEnd('character', -tagClose.length);
                    }
                    range.select();
                    if (document.documentElement && document.documentElement.scrollTop) {
                        document.documentElement.scrollTop = winScroll;
                    } else if (document
                        .body) {
                        document.body.scrollTop = winScroll;
                    }
                } else if (txtarea.selectionStart || txtarea.selectionStart == '0') {
                    var textScroll = txtarea.scrollTop;
                    txtarea.focus();
                    var startPos = txtarea.selectionStart;
                    var endPos = txtarea.selectionEnd;
                    selText = txtarea.value.substring(startPos, endPos);
                    checkSelectedText();
                    txtarea.value = txtarea.value.substring(0, startPos) + tagOpen + selText + tagClose + txtarea.value.substring(endPos);
                    if (isSample) {
                        txtarea.selectionStart = startPos + tagOpen.length;
                        txtarea.selectionEnd = startPos + tagOpen.length + selText.length;
                    } else {
                        txtarea.selectionStart = startPos + tagOpen.length + selText.length + tagClose.length;
                        txtarea.selectionEnd = txtarea.selectionStart;
                    }
                    txtarea.scrollTop = textScroll;
                }
            }, setup: function () {
                var placeholder;
                if ($('#editpage-specialchars').length) {
                    placeholder = $('#editpage-specialchars')[0];
                } else {
                    placeholder = $('<div id="editpage-specialchars"> </div>').prependTo('.mw-editTools')[0];
                }
                if (!placeholder) {
                    return;
                }
                if (!window.charinsertDontMove) {
                    $('.editOptions').before(placeholder);
                }
                EditTools.createEditTools(placeholder);
                EditTools.enableForAllFields();
                window.updateEditTools = function () {
                    EditTools.createEditTools($('#editpage-specialchars')[0]);
                };
            }
        };
        EditTools.setup();
    });
    ;
}, {"css": ["div#editpage-specialchars{display:block;margin-top:.5em;border:1px solid #c0c0c0;padding:.3em}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:29386c84f9c8f19dfb410df7e5be154b */"]}, {});
mw.loader.implement("ext.gadget.teahouse", function () {
    if (wgPageName == 'Wikipedia:Teahouse/Questions' || wgPageName == 'Wikipedia:Teahouse/Question-form2') {
        importScript('MediaWiki:Gadget-teahouse/content.js');
    }
    ;
}, {
    "css": [
        ".wp-teahouse-question-form{position:absolute;margin-left:auto;margin-right:auto;background-color:#f4f3f0;border:1px solid #a7d7f9;padding:1em}#wp-th-question-ask{float:right}.wp-teahouse-ask a.external{background-image:none !important}.wp-teahouse-respond-form{position:absolute;margin-left:auto;margin-right:auto;background-color:#f4f3f0;border:1px solid #a7d7f9;padding:1em}.wp-th-respond{float:right}.wp-teahouse-respond a.external{background-image:none !important}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:ba4e3603af357b5172e85672664d39a8 */"]
}, {});
mw.loader.implement("ext.gettingstarted.openTask", function () {
    (function (window, document, mw, $) {
        'use strict';
        var cfg = mw.config.get(['wgAction', 'wgPageName', 'wgTitle', 'wgCanonicalSpecialPageName', 'wgArticleId', 'wgCurRevisionId', 'wgIsWelcomeCreation', 'wgUserId', 'wgPostEdit']),
            $returnTo, returnToTitle, isNew, bucket;
        if (mw.user.isAnon()) {
            return;
        }

        function setCommonDefaults(schema) {
            var bucket = (cfg.wgUserId % 2 === 0) ? 'test' : 'control';
            var
                defaults = {version: 1, userId: cfg.wgUserId, bucket: bucket};
            mw.eventLog.setDefaults(schema, defaults);
        }

        function isGettingStarted() {
            return cfg.wgIsWelcomeCreation || cfg.wgCanonicalSpecialPageName === 'GettingStarted' || cfg.wgTitle.indexOf('E3 Test Onboarding') !== -1;
        }

        function getTasks() {
            return $.parseJSON($.cookie('openTask')) || {};
        }

        function getSchemaForTask(task) {
            var schema = (task.indexOf('gettingstarted') === 0 || task === 'returnto') ? 'GettingStarted' : 'CommunityPortal';
            return schema;
        }

        function setTask(article, task) {
            var tasks = getTasks();
            if (!task) {
                delete tasks[article];
            } else {
                tasks[article] = task;
            }
            if ($.isEmptyObject(tasks)) {
                $.cookie('openTask', null);
            } else {
                $.cookie('openTask', $.toJSON(tasks), {path: '/'});
            }
        }

        function isAppropriateTask(title) {
            var SPECIAL_NAMESPACE = -1, titleObject;
            if (typeof title !== 'string' || title === '') {
                return false;
            }
            if (title.indexOf('?') !== -1) {
                return false;
            }
            titleObject = new mw.Title(title);
            return titleObject.getNamespaceId() !== SPECIAL_NAMESPACE;
        }

        function getPageFromTitleAttribute(titleText) {
            var
                redLinkFormat = mw.messages.get('red-link-title'), redLinkRegexText, redLinkRegex, redLinkMatch;
            redLinkRegexText = $.escapeRE(redLinkFormat);
            redLinkRegexText = redLinkRegexText.replace('\\$1', '(.+)');
            redLinkRegex = new RegExp('^' + redLinkRegexText + '$');
            redLinkMatch = titleText.match(redLinkRegex);
            if (redLinkMatch !== null) {
                return redLinkMatch[1];
            } else {
                return titleText;
            }
        }

        function checkProgress() {
            var action, fullPageTitle, task, schema, event, isEditable,
                loggedActions = {view: 'page-impression', edit: 'page-edit-impression'};
            if (cfg.wgPostEdit) {
                action = 'page-save-success';
            } else {
                action = loggedActions[cfg.wgAction];
            }
            if (!action) {
                return;
            }
            fullPageTitle = new mw.Title(cfg.wgPageName).getPrefixedText();
            task = getTasks()[fullPageTitle];
            if (task) {
                schema = getSchemaForTask(task);
                setCommonDefaults(schema);
                isEditable = !!$('#ca-edit').length;
                event = {
                    action: action,
                    funnel: task,
                    pageId: cfg.wgArticleId,
                    revId: cfg.wgCurRevisionId,
                    isEditable: isEditable
                };
                mw.eventLog.logEvent(schema, event);
            }
        }

        if (isGettingStarted()) {
            $returnTo = $(
                '#mw-returnto a, #back-to-referrer');
            isNew = !!cfg.wgIsWelcomeCreation;
            setCommonDefaults('GettingStarted');
            mw.eventLog.setDefaults('GettingStarted', {isNew: isNew});
            mw.eventLog.logEvent('GettingStarted', {action: 'gettingstarted-impression'});
            $('#onboarding-tasks a').stall('click', function () {
                var $el = $(this), articleTitle = $el.attr('title'), article, $taskEl, taskName, fullTask;
                $taskEl = $el.closest('.onboarding-task');
                taskName = $taskEl.data('taskName');
                fullTask = 'gettingstarted-' + taskName;
                article = getPageFromTitleAttribute(articleTitle);
                mw.eventLog.logEvent('GettingStarted', {
                    action: 'gettingstarted-click',
                    funnel: fullTask,
                    targetTitle: article
                });
                setTask(article, fullTask);
            });
            returnToTitle = $returnTo.attr('title');
            $returnTo.stall('click', function () {
                var article = getPageFromTitleAttribute(returnToTitle), task = 'returnto';
                mw.eventLog.logEvent('GettingStarted', {
                    action: 'gettingstarted-click',
                    funnel: task,
                    targetTitle: article
                });
                if (isAppropriateTask(article)) {
                    setTask(article, task);
                }
            });
        } else {
            checkProgress();
        }
        mw.openTask =
            mw.openTask || {};
        mw.openTask.setTask = setTask;
        mw.openTask.checkProgress = checkProgress;
        mw.openTask.getTasks = getTasks;
        mw.openTask.isGettingStarted = isGettingStarted;
        mw.openTask.getSchemaForTask = getSchemaForTask;
    }(window, document, mediaWiki, jQuery));
    ;
}, {}, {"red-link-title": "$1 (page does not exist)"});
mw.loader.implement("jquery.autoEllipsis", function () {
    (function ($) {
        var cache = {}, matchTextCache = {};
        $.fn.autoEllipsis = function (options) {
            options = $.extend({
                position: 'center',
                tooltip: false,
                restoreText: false,
                hasSpan: false,
                matchText: null
            }, options);
            return this.each(function () {
                var $trimmableText, text, trimmableText, w, pw, l, r, i, side, m, $container = $(this);
                if (options.restoreText) {
                    if (!$container.data('autoEllipsis.originalText')) {
                        $container.data('autoEllipsis.originalText', $container.text());
                    } else {
                        $container.text($container.data('autoEllipsis.originalText'));
                    }
                }
                if (options.hasSpan) {
                    $trimmableText = $container.children(options.selector);
                } else {
                    $trimmableText = $('<span>').css('whiteSpace', 'nowrap').text($container.text(
                    ));
                    $container.empty().append($trimmableText);
                }
                text = $container.text();
                trimmableText = $trimmableText.text();
                w = $container.width();
                pw = 0;
                if (options.matchText) {
                    if (!(text in matchTextCache)) {
                        matchTextCache[text] = {};
                    }
                    if (!(options.matchText in matchTextCache[text])) {
                        matchTextCache[text][options.matchText] = {};
                    }
                    if (!(w in matchTextCache[text][options.matchText])) {
                        matchTextCache[text][options.matchText][w] = {};
                    }
                    if (options.position in matchTextCache[text][options.matchText][w]) {
                        $container.html(matchTextCache[text][options.matchText][w][options.position]);
                        if (options.tooltip) {
                            $container.attr('title', text);
                        }
                        return;
                    }
                } else {
                    if (!(text in cache)) {
                        cache[text] = {};
                    }
                    if (!(w in cache[text])) {
                        cache[text][w] = {};
                    }
                    if (options.position in cache[text][w]) {
                        $container.html(cache[text][w][options.position]);
                        if (options.tooltip) {
                            $container.attr('title', text);
                        }
                        return;
                    }
                }
                if ($trimmableText.width() + pw > w) {
                    switch (options.position) {
                        case'right':
                            l = 0;
                            r = trimmableText.length;
                            do {
                                m = Math.ceil((l + r) / 2);
                                $trimmableText.text(trimmableText.substr(
                                    0, m) + '...');
                                if ($trimmableText.width() + pw > w) {
                                    r = m - 1;
                                } else {
                                    l = m;
                                }
                            } while (l < r);
                            $trimmableText.text(trimmableText.substr(0, l) + '...');
                            break;
                        case'center':
                            i = [Math.round(trimmableText.length / 2), Math.round(trimmableText.length / 2)];
                            side = 1;
                            while ($trimmableText.outerWidth() + pw > w && i[0] > 0) {
                                $trimmableText.text(trimmableText.substr(0, i[0]) + '...' + trimmableText.substr(i[1]));
                                if (side === 0) {
                                    i[0]--;
                                    side = 1;
                                } else {
                                    i[1]++;
                                    side = 0;
                                }
                            }
                            break;
                        case'left':
                            r = 0;
                            while ($trimmableText.outerWidth() + pw > w && r < trimmableText.length) {
                                $trimmableText.text('...' + trimmableText.substr(r));
                                r++;
                            }
                            break;
                    }
                }
                if (options.tooltip) {
                    $container.attr('title', text);
                }
                if (options.matchText) {
                    $container.highlightText(options.matchText);
                    matchTextCache[text][options.matchText][w][options.position] = $container.html();
                } else {
                    cache[text][w][options.position] = $container.html();
                }
            });
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.checkboxShiftClick", function () {
    (function ($) {
        $.fn.checkboxShiftClick = function () {
            var prevCheckbox = null, $box = this;
            $box.click(function (e) {
                if (
                    prevCheckbox !== null && e.shiftKey) {
                    $box.slice(Math.min($box.index(prevCheckbox), $box.index(e.target)), Math.max($box.index(prevCheckbox), $box.index(e.target)) + 1).prop('checked', !!e.target.checked);
                }
                prevCheckbox = e.target;
            });
            return $box;
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.clickTracking", function () {
    (function ($) {
        var clicktrackingDebug = false, actions = [];

        function trackAction(data) {
            actions.push($.extend(data, {time: new Date().getTime()}));
            $(document).trigger('clicktrack.mediawiki', data);
            if (!clicktrackingDebug) {
                return $.post(mw.util.wikiScript('api'), data);
            }
        }

        if ($.cookie('clicktrackingDebug')) {
            clicktrackingDebug = true;
        }
        if (mw.util.getParamValue('clicktrackingDebug')) {
            $.cookie('clicktrackingDebug', 1, {expires: 7});
            clicktrackingDebug = true;
        }
        if (!$.cookie('clicktracking-session')) {
            var token = '', dict = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
                date = new Date().getTime();
            while (token.length <= 32) {
                token += dict.charAt(((Math.random() * date) + token.length + date) % dict.length);
            }
            $.cookie(
                'clicktracking-session', token, {'path': '/'});
        }
        $.getTrackedActions = function () {
            return $.extend(true, [], actions);
        };
        $.trackAction = function (id) {
            return $.trackActionWithOptions({'id': id});
        };
        $.trackActionWithInfo = function (id, info) {
            return $.trackActionWithOptions({'id': id, 'info': info});
        };
        $.trackActionWithOptions = function (options) {
            options = $.extend({
                'namespace': mw.config.get('wgNamespaceNumber'),
                'token': $.cookie('clicktracking-session')
            }, options);
            if (!options.id) {
                throw new Error("You must specify an event ID");
            }
            var data = {'action': 'clicktracking', 'format': 'json', 'eventid': options.id, 'token': options.token};
            if (options.namespace !== undefined) {
                data.namespacenumber = options.namespace;
            }
            if (options.info !== undefined) {
                data.additional = options.info;
            }
            return trackAction(data);
        };
        $.trackActionURL = function (url, id) {
            return mw.config.get('wgScriptPath') + '/api.php?' + $.param({
                'action': 'clicktracking',
                'format': 'json',
                'eventid': id,
                'namespacenumber': mw.config.get('wgNamespaceNumber'),
                'token': $.cookie('clicktracking-session')
                ,
                'redirectto': url
            });
        };
    })(jQuery);
    ;
}, {}, {});
mw.loader.implement("jquery.delayedBind", function () {
    (function ($) {
        function encodeEvent(event) {
            return event.replace(/-/g, '--').replace(/ /g, '-');
        }

        $.fn.extend({
            delayedBind: function (timeout, event, data, callback) {
                if (arguments.length === 3) {
                    callback = data;
                    data = undefined;
                }
                var encEvent = encodeEvent(event);
                return this.each(function () {
                    var that = this;
                    if (!($(this).data('_delayedBindBound-' + encEvent + '-' + timeout))) {
                        $(this).data('_delayedBindBound-' + encEvent + '-' + timeout, true);
                        $(this).bind(event, function () {
                            var timerID = $(this).data('_delayedBindTimerID-' + encEvent + '-' + timeout);
                            if (timerID !== null) {
                                clearTimeout(timerID);
                            }
                            timerID = setTimeout(function () {
                                $(that).trigger('_delayedBind-' + encEvent + '-' + timeout);
                            }, timeout);
                            $(this).data('_delayedBindTimerID-' + encEvent + '-' + timeout, timerID);
                        });
                    }
                    $(this).bind('_delayedBind-' + encEvent + '-' + timeout, data, callback);
                });
            }, delayedBindCancel: function (timeout, event) {
                var encEvent = encodeEvent(event);
                return this.each(function () {
                    var timerID = $(this
                    ).data('_delayedBindTimerID-' + encEvent + '-' + timeout);
                    if (timerID !== null) {
                        clearTimeout(timerID);
                    }
                });
            }, delayedBindUnbind: function (timeout, event, callback) {
                var encEvent = encodeEvent(event);
                return this.each(function () {
                    $(this).unbind('_delayedBind-' + encEvent + '-' + timeout, callback);
                });
            }
        });
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.hidpi", function () {
    (function ($) {
        $.devicePixelRatio = function () {
            if (window.devicePixelRatio !== undefined) {
                return window.devicePixelRatio;
            } else if (window.msMatchMedia !== undefined) {
                if (window.msMatchMedia('(min-resolution: 192dpi)').matches) {
                    return 2;
                } else if (window.msMatchMedia('(min-resolution: 144dpi)').matches) {
                    return 1.5;
                } else {
                    return 1;
                }
            } else {
                return 1;
            }
        };
        $.fn.hidpi = function () {
            var $target = this, devicePixelRatio = $.devicePixelRatio(), testImage = new Image();
            if (devicePixelRatio > 1 && testImage.srcset === undefined) {
                $target.find('img').each(function () {
                    var $img = $(this), srcset = $img.attr('srcset'), match;
                    if (typeof srcset === 'string' && srcset !== '') {
                        match = $.matchSrcSet(devicePixelRatio,
                            srcset);
                        if (match !== null) {
                            $img.attr('src', match);
                        }
                    }
                });
            }
            return $target;
        };
        $.matchSrcSet = function (devicePixelRatio, srcset) {
            var candidates, candidate, bits, src, i, ratioStr, ratio, selectedRatio = 1, selectedSrc = null;
            candidates = srcset.split(/ *, */);
            for (i = 0; i < candidates.length; i++) {
                candidate = candidates[i];
                bits = candidate.split(/ +/);
                src = bits[0];
                if (bits.length > 1 && bits[1].charAt(bits[1].length - 1) === 'x') {
                    ratioStr = bits[1].substr(0, bits[1].length - 1);
                    ratio = parseFloat(ratioStr);
                    if (ratio <= devicePixelRatio && ratio > selectedRatio) {
                        selectedRatio = ratio;
                        selectedSrc = src;
                    }
                }
            }
            return selectedSrc;
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.highlightText", function () {
    (function ($) {
        $.highlightText = {
            splitAndHighlight: function (node, pat) {
                var i, patArray = pat.split(' ');
                for (i = 0; i < patArray.length; i++) {
                    if (patArray[i].length === 0) {
                        continue;
                    }
                    $.highlightText.innerHighlight(node, patArray[i]);
                }
                return node;
            }, innerHighlight: function (node, pat) {
                var i, match, pos, spannode, middlebit, middleclone;
                if (node.nodeType === 3) {
                    match = node.data.match(
                        new RegExp('(^|\\s)' + $.escapeRE(pat), 'i'));
                    if (match) {
                        pos = match.index + match[1].length;
                        spannode = document.createElement('span');
                        spannode.className = 'highlight';
                        middlebit = node.splitText(pos);
                        middlebit.splitText(pat.length);
                        middleclone = middlebit.cloneNode(true);
                        spannode.appendChild(middleclone);
                        middlebit.parentNode.replaceChild(spannode, middlebit);
                    }
                } else if (node.nodeType === 1 && node.childNodes && !/(script|style)/i.test(node.tagName) && !(node.tagName.toLowerCase() === 'span' && node.className.match(/\bhighlight/))) {
                    for (i = 0; i < node.childNodes.length; ++i) {
                        $.highlightText.innerHighlight(node.childNodes[i], pat);
                    }
                }
            }
        };
        $.fn.highlightText = function (matchString) {
            return this.each(function () {
                var $el = $(this);
                $el.data('highlightText', {originalText: $el.text()});
                $.highlightText.splitAndHighlight(this, matchString);
            });
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.json", function () {
    (function ($) {
        'use strict';
        var escape = /["\\\x00-\x1f\x7f-\x9f]/g, meta = {
            '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"',
            '\\': '\\\\'
        }, hasOwn = Object.prototype.hasOwnProperty;
        $.toJSON = typeof JSON === 'object' && JSON.stringify ? JSON.stringify : function (o) {
            if (o === null) {
                return 'null';
            }
            var pairs, k, name, val, type = $.type(o);
            if (type === 'undefined') {
                return undefined;
            }
            if (type === 'number' || type === 'boolean') {
                return String(o);
            }
            if (type === 'string') {
                return $.quoteString(o);
            }
            if (typeof o.toJSON === 'function') {
                return $.toJSON(o.toJSON());
            }
            if (type === 'date') {
                var month = o.getUTCMonth() + 1, day = o.getUTCDate(), year = o.getUTCFullYear(),
                    hours = o.getUTCHours(), minutes = o.getUTCMinutes(), seconds = o.getUTCSeconds(),
                    milli = o.getUTCMilliseconds();
                if (month < 10) {
                    month = '0' + month;
                }
                if (day < 10) {
                    day = '0' + day;
                }
                if (hours < 10) {
                    hours = '0' + hours;
                }
                if (minutes < 10) {
                    minutes = '0' + minutes;
                }
                if (seconds < 10) {
                    seconds = '0' + seconds;
                }
                if (milli < 100) {
                    milli = '0' + milli;
                }
                if (milli < 10) {
                    milli = '0' + milli;
                }
                return '"' + year + '-' + month + '-' + day + 'T' + hours + ':' + minutes + ':' + seconds + '.' + milli + 'Z"';
            }
            pairs = [];
            if ($.isArray(o)) {
                for (k = 0; k < o.length; k++) {
                    pairs.push($.toJSON(o[k]) || 'null');
                }
                return '[' + pairs.join(',') +
                    ']';
            }
            if (typeof o === 'object') {
                for (k in o) {
                    if (hasOwn.call(o, k)) {
                        type = typeof k;
                        if (type === 'number') {
                            name = '"' + k + '"';
                        } else if (type === 'string') {
                            name = $.quoteString(k);
                        } else {
                            continue;
                        }
                        type = typeof o[k];
                        if (type !== 'function' && type !== 'undefined') {
                            val = $.toJSON(o[k]);
                            pairs.push(name + ':' + val);
                        }
                    }
                }
                return '{' + pairs.join(',') + '}';
            }
        };
        $.evalJSON = typeof JSON === 'object' && JSON.parse ? JSON.parse : function (str) {
            return eval('(' + str + ')');
        };
        $.secureEvalJSON = typeof JSON === 'object' && JSON.parse ? JSON.parse : function (str) {
            var filtered = str.replace(/\\["\\\/bfnrtu]/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, '');
            if (/^[\],:{}\s]*$/.test(filtered)) {
                return eval('(' + str + ')');
            }
            throw new SyntaxError('Error parsing JSON, source is not valid.');
        };
        $.quoteString = function (str) {
            if (str.match(escape)) {
                return '"' + str.replace(escape, function (a) {
                    var c = meta[a];
                    if (typeof c === 'string') {
                        return c;
                    }
                    c = a.charCodeAt();
                    return '\\u00' + Math.floor(c / 16).toString(16) + (c % 16).toString(16
                    );
                }) + '"';
            }
            return '"' + str + '"';
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.makeCollapsible", function () {
    (function ($, mw) {
        $.fn.makeCollapsible = function () {
            return this.each(function () {
                var lpx = 'jquery.makeCollapsible> ', collapsible = this,
                    $collapsible = $(collapsible).addClass('mw-collapsible'),
                    collapsetext = $collapsible.attr('data-collapsetext'),
                    expandtext = $collapsible.attr('data-expandtext'), $toggle, $toggleLink, $firstItem, collapsibleId,
                    $customTogglers, firstval,
                    toggleElement = function ($collapsible, action, $defaultToggle, options) {
                        var $collapsibleContent, $containers;
                        options = options || {};
                        if (!$collapsible.jquery) {
                            return;
                        }
                        if (action !== 'expand' && action !== 'collapse') {
                            return;
                        }
                        if ($defaultToggle === undefined) {
                            $defaultToggle = null;
                        }
                        if ($defaultToggle !== null && !$defaultToggle.jquery) {
                            return;
                        }
                        if (action === 'collapse') {
                            if ($collapsible.is('table')) {
                                $containers = $collapsible.find('> tbody > tr');
                                if ($defaultToggle) {
                                    $containers = $containers.not($defaultToggle.closest('tr'));
                                }
                                if (options.instantHide) {
                                    $containers.hide();
                                } else {
                                    $containers.stop(true, true).fadeOut();
                                }
                            } else if ($collapsible.is('ul') || $collapsible.is('ol')) {
                                $containers = $collapsible.find('> li');
                                if ($defaultToggle) {
                                    $containers = $containers.not($defaultToggle.parent());
                                }
                                if (options.instantHide) {
                                    $containers.hide();
                                } else {
                                    $containers.stop(true, true).slideUp();
                                }
                            } else {
                                $collapsibleContent = $collapsible.find('> .mw-collapsible-content');
                                if ($collapsibleContent.length) {
                                    if (options.instantHide) {
                                        $collapsibleContent.hide();
                                    } else {
                                        $collapsibleContent.slideUp();
                                    }
                                } else {
                                    if (options.instantHide) {
                                        $collapsible.hide();
                                    } else {
                                        if ($collapsible.is('tr') || $collapsible.is('td') || $collapsible.is('th')) {
                                            $collapsible.fadeOut();
                                        } else {
                                            $collapsible.slideUp();
                                        }
                                    }
                                }
                            }
                        } else {
                            if ($collapsible.is('table')) {
                                $containers = $collapsible.find('>tbody>tr');
                                if ($defaultToggle) {
                                    $containers.not($defaultToggle.parent().parent()).stop(true, true).fadeIn();
                                } else {
                                    $containers.stop(true, true).fadeIn();
                                }
                            } else if ($collapsible.is('ul') || $collapsible.is('ol')) {
                                $containers = $collapsible.find('> li');
                                if ($defaultToggle
                                ) {
                                    $containers.not($defaultToggle.parent()).stop(true, true).slideDown();
                                } else {
                                    $containers.stop(true, true).slideDown();
                                }
                            } else {
                                $collapsibleContent = $collapsible.find('> .mw-collapsible-content');
                                if ($collapsibleContent.length) {
                                    $collapsibleContent.slideDown();
                                } else {
                                    if ($collapsible.is('tr') || $collapsible.is('td') || $collapsible.is('th')) {
                                        $collapsible.fadeIn();
                                    } else {
                                        $collapsible.slideDown();
                                    }
                                }
                            }
                        }
                    }, toggleLinkDefault = function ($that, e, options) {
                        var $collapsible = $that.closest('.mw-collapsible').toggleClass('mw-collapsed');
                        e.preventDefault();
                        e.stopPropagation();
                        if (!$that.hasClass('mw-collapsible-toggle-collapsed')) {
                            $that.removeClass('mw-collapsible-toggle-expanded').addClass('mw-collapsible-toggle-collapsed');
                            if ($that.find('> a').length) {
                                $that.find('> a').text(expandtext);
                            } else {
                                $that.text(expandtext);
                            }
                            toggleElement($collapsible, 'collapse', $that, options);
                        } else {
                            $that.removeClass('mw-collapsible-toggle-collapsed').addClass('mw-collapsible-toggle-expanded');
                            if ($that.find('> a').length) {
                                $that.find('> a').text(collapsetext);
                            } else {
                                $that.text(collapsetext);
                            }
                            toggleElement($collapsible, 'expand', $that, options);
                        }
                        return;
                    }, toggleLinkPremade = function ($that, e, options) {
                        var $collapsible = $that.eq(0).closest('.mw-collapsible').toggleClass('mw-collapsed');
                        if ($.nodeName(e.target, 'a')) {
                            return true;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        if (!$that.hasClass('mw-collapsible-toggle-collapsed')) {
                            $that.removeClass('mw-collapsible-toggle-expanded').addClass('mw-collapsible-toggle-collapsed');
                            toggleElement($collapsible, 'collapse', $that, options);
                        } else {
                            $that.removeClass('mw-collapsible-toggle-collapsed').addClass('mw-collapsible-toggle-expanded');
                            toggleElement($collapsible, 'expand', $that, options);
                        }
                        return;
                    }, toggleLinkCustom = function ($that, e, options, $collapsible) {
                        if (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        var action = $collapsible.hasClass('mw-collapsed') ? 'expand' : 'collapse';
                        $collapsible.toggleClass('mw-collapsed');
                        toggleElement($collapsible, action, $that, options);
                    };
                if ($collapsible.data('mw-made-collapsible')) {
                    return;
                } else {
                    $collapsible.data('mw-made-collapsible', true);
                }
                if (!collapsetext) {
                    collapsetext = mw.msg('collapsible-collapse');
                }
                if (!expandtext) {
                    expandtext = mw.msg('collapsible-expand');
                }
                $toggleLink = $('<a href="#"></a>').text(collapsetext).wrap('<span class="mw-collapsible-toggle"></span>').parent().prepend('&nbsp;[').append(']&nbsp;').on('click.mw-collapse', function (e, options) {
                    toggleLinkDefault($(this), e, options);
                });
                if (($collapsible.attr('id') || '').indexOf('mw-customcollapsible-') === 0) {
                    collapsibleId = $collapsible.attr('id');
                    $customTogglers = $('.' + collapsibleId.replace('mw-customcollapsible', 'mw-customtoggle'));
                    mw.log(lpx + 'Found custom collapsible: #' + collapsibleId);
                    if ($customTogglers.length) {
                        $customTogglers.on('click.mw-collapse', function (e, options) {
                            toggleLinkCustom($(this), e, options, $collapsible);
                        });
                    } else {
                        mw.log(lpx + '#' + collapsibleId + ': Missing toggler!');
                    }
                    if ($collapsible.hasClass('mw-collapsed')) {
                        $collapsible.removeClass('mw-collapsed');
                        toggleLinkCustom($customTogglers, null, {
                            instantHide: true
                        }, $collapsible);
                    }
                } else {
                    if ($collapsible.is('table')) {
                        $firstItem = $collapsible.find('tr:first th, tr:first td');
                        $toggle = $firstItem.find('> .mw-collapsible-toggle');
                        if (!$toggle.length) {
                            $firstItem.eq(-1).prepend($toggleLink);
                        } else {
                            $toggleLink = $toggle.off('click.mw-collapse').on('click.mw-collapse', function (e, options) {
                                toggleLinkPremade($toggle, e, options);
                            });
                        }
                    } else if ($collapsible.is('ul') || $collapsible.is('ol')) {
                        $firstItem = $collapsible.find('li:first');
                        $toggle = $firstItem.find('> .mw-collapsible-toggle');
                        if (!$toggle.length) {
                            firstval = $firstItem.attr('value');
                            if (firstval === undefined || !firstval || firstval === '-1' || firstval === -1) {
                                $firstItem.attr('value', '1');
                            }
                            $collapsible.prepend($toggleLink.wrap('<li class="mw-collapsible-toggle-li"></li>').parent());
                        } else {
                            $toggleLink = $toggle.off('click.mw-collapse').on('click.mw-collapse', function (e, options) {
                                toggleLinkPremade($toggle, e, options);
                            });
                        }
                    } else {
                        $toggle = $collapsible.find('> .mw-collapsible-toggle');
                        if (!$collapsible.find('> .mw-collapsible-content').length) {
                            $collapsible.wrapInner('<div class="mw-collapsible-content"></div>');
                        }
                        if (!$toggle.length) {
                            $collapsible.prepend($toggleLink);
                        } else {
                            $toggleLink = $toggle.off('click.mw-collapse').on('click.mw-collapse', function (e, options) {
                                toggleLinkPremade($toggle, e, options);
                            });
                        }
                    }
                }
                if ($collapsible.hasClass('mw-collapsed') && ($collapsible.attr('id') || '').indexOf('mw-customcollapsible-') !== 0) {
                    $collapsible.removeClass('mw-collapsed');
                    $toggleLink.eq(0).trigger('click', [{instantHide: true}]);
                }
            });
        };
    }(jQuery, mediaWiki));
    ;
}, {"css": [".mw-collapsible-toggle{float:right} li .mw-collapsible-toggle{float:none} .mw-collapsible-toggle-li{list-style:none}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:4250852ed2349a0d4d0fc6509a3e7d4c */"]}, {
    "collapsible-expand": "expand",
    "collapsible-collapse": "collapse"
});
mw.loader.implement("jquery.mw-jump", function () {
    jQuery(function ($) {
        $('.mw-jump').on('focus blur', 'a', function (e) {
            if (e.type === 'blur' || e.type === 'focusout') {
                $(this).closest('.mw-jump').css({height: 0});
            } else {
                $
                (this).closest('.mw-jump').css({height: 'auto'});
            }
        });
    });
    ;
}, {}, {});
mw.loader.implement("jquery.placeholder", function () {
    (function ($) {
        $.fn.placeholder = function () {
            return this.each(function () {
                var placeholder, $input;
                if (this.placeholder && 'placeholder' in document.createElement(this.tagName)) {
                    return;
                }
                placeholder = this.getAttribute('placeholder');
                $input = $(this);
                if (this.value === '' || this.value === placeholder) {
                    $input.addClass('placeholder').val(placeholder);
                }
                $input.blur(function () {
                    if (this.value === '') {
                        this.value = placeholder;
                        $input.addClass('placeholder');
                    }
                }).on('focus drop keydown paste', function (e) {
                    if ($input.hasClass('placeholder')) {
                        if (e.type === 'drop' && e.originalEvent.dataTransfer) {
                            try {
                                this.value = e.originalEvent.dataTransfer.getData('text/plain');
                            } catch (exception) {
                                this.value = e.originalEvent.dataTransfer.getData('text');
                            }
                            e.preventDefault();
                        } else {
                            this.value = '';
                        }
                        $input.removeClass('placeholder');
                    }
                });
                if (this.form) {
                    $(this.form).submit(function () {
                        if ($input.hasClass('placeholder')) {
                            $input.val('').removeClass
                            ('placeholder');
                        }
                    });
                }
            });
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("jquery.suggestions", function () {
    (function ($) {
        $.suggestions = {
            cancel: function (context) {
                if (context.data.timerID !== null) {
                    clearTimeout(context.data.timerID);
                }
                if ($.isFunction(context.config.cancel)) {
                    context.config.cancel.call(context.data.$textbox);
                }
            }, restore: function (context) {
                context.data.$textbox.val(context.data.prevText);
            }, update: function (context, delayed) {
                function maybeFetch() {
                    if (context.data.$textbox.val().length === 0) {
                        context.data.$container.hide();
                        context.data.prevText = '';
                    } else if (context.data.$textbox.val() !== context.data.prevText || !context.data.$container.is(':visible')) {
                        if (typeof context.config.fetch === 'function') {
                            context.data.prevText = context.data.$textbox.val();
                            context.config.fetch.call(context.data.$textbox, context.data.$textbox.val());
                        }
                    }
                }

                $.suggestions.cancel(context);
                if (delayed) {
                    context.data.timerID = setTimeout(maybeFetch, context.config.delay);
                } else {
                    maybeFetch();
                }
                $.suggestions.special(context);
            }, special: function (
                context) {
                if (typeof context.config.special.render === 'function') {
                    setTimeout(function () {
                        var $special = context.data.$container.find('.suggestions-special');
                        context.config.special.render.call($special, context.data.$textbox.val(), context);
                    }, 1);
                }
            }, configure: function (context, property, value) {
                var newCSS, $autoEllipseMe, $result, $results, childrenWidth, i, expWidth, matchedText, maxWidth, text;
                switch (property) {
                    case'fetch':
                    case'cancel':
                    case'special':
                    case'result':
                    case'$region':
                    case'expandFrom':
                        context.config[property] = value;
                        break;
                    case'suggestions':
                        context.config[property] = value;
                        if (context.data !== undefined) {
                            if (context.data.$textbox.val().length === 0) {
                                context.data.$container.hide();
                            } else {
                                context.data.$container.show();
                                newCSS = {
                                    top: context.config.$region.offset().top + context.config.$region.outerHeight(),
                                    bottom: 'auto',
                                    width: context.config.$region.outerWidth(),
                                    height: 'auto'
                                };
                                context.config.expandFrom = (function (expandFrom) {
                                    var regionWidth, docWidth, regionCenter, docCenter,
                                        docDir = $(document.documentElement).css(
                                            'direction'), $region = context.config.$region;
                                    if (context.config.positionFromLeft) {
                                        expandFrom = 'left';
                                    } else if ($.inArray(expandFrom, ['left', 'right', 'start', 'end', 'auto']) === -1) {
                                        expandFrom = 'auto';
                                    }
                                    if (expandFrom === 'auto') {
                                        if ($region.data('searchsuggest-expand-dir')) {
                                            expandFrom = $region.data('searchsuggest-expand-dir');
                                        } else {
                                            regionWidth = $region.outerWidth();
                                            docWidth = $(document).width();
                                            if ((regionWidth / docWidth) > 0.85) {
                                                expandFrom = 'start';
                                            } else {
                                                regionCenter = $region.offset().left + regionWidth / 2;
                                                docCenter = docWidth / 2;
                                                if (Math.abs(regionCenter - docCenter) / docCenter < 0.10) {
                                                    expandFrom = 'start';
                                                } else {
                                                    expandFrom = regionCenter > docCenter ? 'right' : 'left';
                                                }
                                            }
                                        }
                                    }
                                    if (expandFrom === 'start') {
                                        expandFrom = docDir === 'rtl' ? 'right' : 'left';
                                    } else if (expandFrom === 'end') {
                                        expandFrom = docDir === 'rtl' ? 'left' : 'right';
                                    }
                                    return expandFrom;
                                }(context.config.expandFrom));
                                if (context.config.expandFrom === 'left') {
                                    newCSS.left = context.config.$region.offset().left;
                                    newCSS.right = 'auto';
                                } else {
                                    newCSS.left = 'auto';
                                    newCSS.right = $('body').width() - (context.config.$region.offset().left + context.config.$region.outerWidth());
                                }
                                context.data.$container.css(newCSS);
                                $results = context.data.$container.children('.suggestions-results');
                                $results.empty();
                                expWidth = -1;
                                $autoEllipseMe = $([]);
                                matchedText = null;
                                for (i = 0; i < context.config.suggestions.length; i++) {
                                    text = context.config.suggestions[i];
                                    $result = $('<div>').addClass('suggestions-result').attr('rel', i).data('text', context.config.suggestions[i]).mousemove(function () {
                                        context.data.selectedWithMouse = true;
                                        $.suggestions.highlight(context, $(this).closest('.suggestions-results .suggestions-result'), false);
                                    }).appendTo($results);
                                    if (typeof context.config.result.render === 'function') {
                                        context.config.result.render.call($result, context.config.suggestions[i], context);
                                    } else {
                                        $result.append($('<span>').css('whiteSpace', 'nowrap').text(text));
                                    }
                                    if (context.config.highlightInput) {
                                        matchedText = context.data.prevText;
                                    }
                                    childrenWidth = $result.children().outerWidth();
                                    if (childrenWidth > $result.width() && childrenWidth > expWidth) {
                                        expWidth =
                                            childrenWidth + (context.data.$container.width() - $result.width());
                                    }
                                    $autoEllipseMe = $autoEllipseMe.add($result);
                                }
                                if (expWidth > context.data.$container.width()) {
                                    maxWidth = context.config.maxExpandFactor * context.data.$textbox.width();
                                    context.data.$container.width(Math.min(expWidth, maxWidth));
                                }
                                $autoEllipseMe.autoEllipsis({hasSpan: true, tooltip: true, matchText: matchedText});
                            }
                        }
                        break;
                    case'maxRows':
                        context.config[property] = Math.max(1, Math.min(100, value));
                        break;
                    case'delay':
                        context.config[property] = Math.max(0, Math.min(1200, value));
                        break;
                    case'maxExpandFactor':
                        context.config[property] = Math.max(1, value);
                        break;
                    case'submitOnClick':
                    case'positionFromLeft':
                    case'highlightInput':
                        context.config[property] = value ? true : false;
                        break;
                }
            }, highlight: function (context, result, updateTextbox) {
                var selected = context.data.$container.find('.suggestions-result-current');
                if (!result.get || selected.get(0) !== result.get(0)) {
                    if (result === 'prev') {
                        if (selected.hasClass('suggestions-special')) {
                            result = context.data.$container.find(
                                '.suggestions-result:last');
                        } else {
                            result = selected.prev();
                            if (!(result.length && result.hasClass('suggestions-result'))) {
                                result = selected.parents('.suggestions-results > *').prev().find('.suggestions-result').eq(0);
                            }
                            if (selected.length === 0) {
                                if (context.data.$container.find('.suggestions-special').html() !== '') {
                                    result = context.data.$container.find('.suggestions-special');
                                } else {
                                    result = context.data.$container.find('.suggestions-results .suggestions-result:last');
                                }
                            }
                        }
                    } else if (result === 'next') {
                        if (selected.length === 0) {
                            result = context.data.$container.find('.suggestions-results .suggestions-result:first');
                            if (result.length === 0 && context.data.$container.find('.suggestions-special').html() !== '') {
                                result = context.data.$container.find('.suggestions-special');
                            }
                        } else {
                            result = selected.next();
                            if (!(result.length && result.hasClass('suggestions-result'))) {
                                result = selected.parents('.suggestions-results > *').next().find('.suggestions-result').eq(0);
                            }
                            if (selected.hasClass('suggestions-special')) {
                                result = $([]);
                            } else if (result.length === 0 && context.data.$container.find('.suggestions-special').html() !== '') {
                                result = context.data.$container.find('.suggestions-special');
                            }
                        }
                    }
                    selected.removeClass('suggestions-result-current');
                    result.addClass('suggestions-result-current');
                }
                if (updateTextbox) {
                    if (result.length === 0 || result.is('.suggestions-special')) {
                        $.suggestions.restore(context);
                    } else {
                        context.data.$textbox.val(result.data('text'));
                        context.data.$textbox.change();
                    }
                    context.data.$textbox.trigger('change');
                }
            }, keypress: function (e, context, key) {
                var selected, wasVisible = context.data.$container.is(':visible'), preventDefault = false;
                switch (key) {
                    case 40:
                        if (wasVisible) {
                            $.suggestions.highlight(context, 'next', true);
                            context.data.selectedWithMouse = false;
                        } else {
                            $.suggestions.update(context, false);
                        }
                        preventDefault = true;
                        break;
                    case 38:
                        if (wasVisible) {
                            $.suggestions.highlight(context, 'prev', true);
                            context.data.selectedWithMouse = false;
                        }
                        preventDefault = wasVisible;
                        break;
                    case 27:
                        context.data.$container.hide();
                        $.suggestions.restore(context);
                        $.suggestions.cancel(context);
                        context.data.$textbox.trigger('change');
                        preventDefault = wasVisible;
                        break;
                    case 13:
                        context.data.$container.hide();
                        preventDefault = wasVisible;
                        selected = context.data.$container.find('.suggestions-result-current');
                        if (selected.length === 0 || context.data.selectedWithMouse) {
                            $.suggestions.cancel(context);
                            context.config.$region.closest('form').submit();
                        } else if (selected.is('.suggestions-special')) {
                            if (typeof context.config.special.select === 'function') {
                                context.config.special.select.call(selected, context.data.$textbox);
                            }
                        } else {
                            if (typeof context.config.result.select === 'function') {
                                $.suggestions.highlight(context, selected, true);
                                context.config.result.select.call(selected, context.data.$textbox);
                            } else {
                                $.suggestions.highlight(context, selected, true);
                            }
                        }
                        break;
                    default:
                        $.suggestions.update(context, true);
                        break;
                }
                if (preventDefault) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            }
        };
        $.fn.suggestions = function () {
            var returnValue, args = arguments;
            $(this).each(function () {
                var context, key;
                context = $(this).data(
                    'suggestions-context');
                if (context === undefined || context === null) {
                    context = {
                        config: {
                            fetch: function () {
                            },
                            cancel: function () {
                            },
                            special: {},
                            result: {},
                            $region: $(this),
                            suggestions: [],
                            maxRows: 7,
                            delay: 120,
                            submitOnClick: false,
                            maxExpandFactor: 3,
                            expandFrom: 'auto',
                            highlightInput: false
                        }
                    };
                }
                if (args.length > 0) {
                    if (typeof args[0] === 'object') {
                        for (key in args[0]) {
                            $.suggestions.configure(context, key, args[0][key]);
                        }
                    } else if (typeof args[0] === 'string') {
                        if (args.length > 1) {
                            $.suggestions.configure(context, args[0], args[1]);
                        } else if (returnValue === null || returnValue === undefined) {
                            returnValue = (args[0] in context.config ? undefined : context.config[args[0]]);
                        }
                    }
                }
                if (context.data === undefined) {
                    context.data = {
                        timerID: null,
                        prevText: null,
                        visibleResults: 0,
                        mouseDownOn: $([]),
                        $textbox: $(this),
                        selectedWithMouse: false
                    };
                    context.data.$container = $('<div>').css('display', 'none').addClass('suggestions').append($('<div>').addClass('suggestions-results').mousedown(function (e) {
                        context.data.mouseDownOn = $(e.target).closest(
                            '.suggestions-results .suggestions-result');
                    }).mouseup(function (e) {
                        var $result = $(e.target).closest('.suggestions-results .suggestions-result'),
                            $other = context.data.mouseDownOn;
                        context.data.mouseDownOn = $([]);
                        if ($result.get(0) !== $other.get(0)) {
                            return;
                        }
                        if (!(e.which !== 1 || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey)) {
                            $.suggestions.highlight(context, $result, true);
                            context.data.$container.hide();
                            if (typeof context.config.result.select === 'function') {
                                context.config.result.select.call($result, context.data.$textbox);
                            }
                        }
                        context.data.$textbox.focus();
                    })).append($('<div>').addClass('suggestions-special').mousedown(function (e) {
                        context.data.mouseDownOn = $(e.target).closest('.suggestions-special');
                    }).mouseup(function (e) {
                        var $special = $(e.target).closest('.suggestions-special'), $other = context.data.mouseDownOn;
                        context.data.mouseDownOn = $([]);
                        if ($special.get(0) !== $other.get(0)) {
                            return;
                        }
                        if (!(e.which !== 1 || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey)) {
                            context.data.$container.hide();
                            if (typeof context.config.special.select === 'function') {
                                context.config.special.select.call($special, context.data.$textbox);
                            }
                        }
                        context.data.$textbox.focus();
                    }).mousemove(function (e) {
                        context.data.selectedWithMouse = true;
                        $.suggestions.highlight(context, $(e.target).closest('.suggestions-special'), false);
                    })).appendTo($('body'));
                    $(this).attr('autocomplete', 'off').keydown(function (e) {
                        context.data.keypressed = e.which;
                        context.data.keypressedCount = 0;
                        switch (context.data.keypressed) {
                            case 40:
                                e.preventDefault();
                                e.stopImmediatePropagation();
                                break;
                            case 38:
                            case 27:
                            case 13:
                                if (context.data.$container.is(':visible')) {
                                    e.preventDefault();
                                    e.stopImmediatePropagation();
                                }
                        }
                    }).keypress(function (e) {
                        context.data.keypressedCount++;
                        $.suggestions.keypress(e, context, context.data.keypressed);
                    }).keyup(function (e) {
                        if (context.data.keypressedCount === 0) {
                            $.suggestions.keypress(e, context, context.data.keypressed);
                        }
                    }).blur(function () {
                        if (context.data.mouseDownOn.length > 0) {
                            return;
                        }
                        context.data.$container.hide();
                        $.suggestions.cancel(context);
                    });
                }
                $(this).data(
                    'suggestions-context', context);
            });
            return returnValue !== undefined ? returnValue : $(this);
        };
    }(jQuery));
    ;
}, {
    "css": [
        ".suggestions{overflow:hidden;position:absolute;top:0;left:0;width:0;border:none;z-index:1099;padding:0;margin:-1px -1px 0 0} html \x3e body .suggestions{margin:-1px 0 0 0}.suggestions-special{position:relative;background-color:white;cursor:pointer;border:solid 1px #aaaaaa;padding:0;margin:0;margin-top:-2px;display:none;padding:0.25em 0.25em;line-height:1.25em}.suggestions-results{background-color:white;cursor:pointer;border:solid 1px #aaaaaa;padding:0;margin:0}.suggestions-result{color:black;margin:0;line-height:1.5em;padding:0.01em 0.25em;text-align:left}.suggestions-result-current{background-color:#4C59A6;color:white}.suggestions-special .special-label{color:gray;text-align:left}.suggestions-special .special-query{color:black;font-style:italic;text-align:left}.suggestions-special .special-hover{background-color:silver}.suggestions-result-current .special-label,.suggestions-result-current .special-query{color:white}.autoellipsis-matched,.highlight{font-weight:bold}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:9780324491b653a3780e2d029bdc140c */"
    ]
}, {});
mw.loader.implement("jquery.tabIndex", function () {
    (function ($) {
        $.fn.firstTabIndex = function () {
            var minTabIndex = null;
            $(this).find('[tabindex]').each(function () {
                var tabIndex = parseInt($(this).prop('tabindex'), 10);
                if (tabIndex > 0 && !isNaN(tabIndex)) {
                    if (minTabIndex === null) {
                        minTabIndex = tabIndex;
                    } else if (tabIndex < minTabIndex) {
                        minTabIndex = tabIndex;
                    }
                }
            });
            return minTabIndex;
        };
        $.fn.lastTabIndex = function () {
            var maxTabIndex = null;
            $(this).find('[tabindex]').each(function () {
                var tabIndex = parseInt($(this).prop('tabindex'), 10);
                if (tabIndex > 0 && !isNaN(tabIndex)) {
                    if (maxTabIndex === null) {
                        maxTabIndex = tabIndex;
                    } else if (tabIndex > maxTabIndex) {
                        maxTabIndex = tabIndex;
                    }
                }
            });
            return maxTabIndex;
        };
    }(jQuery));
    ;
}, {}, {});
mw.loader.implement("mediawiki.Title", function () {
    (function (mw, $) {
        function Title(title, namespace) {
            this.ns = 0;
            this.name = null;
            this.ext = null;
            if (arguments.length === 2) {
                setNameAndExtension(this, title);
                this.ns = fixNsId(namespace);
            } else if (arguments.length === 1) {
                setAll(this, title);
            }
            return this;
        }

        var fn, clean = function (s) {
            if
            (s !== undefined) {
                return s.replace(/[\x00-\x1f\x23\x3c\x3e\x5b\x5d\x7b\x7c\x7d\x7f\s]+/g, '_');
            }
        }, text = function (s) {
            if (s !== null && s !== undefined) {
                return s.replace(/_/g, ' ');
            } else {
                return '';
            }
        }, fixName = function (s) {
            return clean($.trim(s));
        }, fixExt = function (s) {
            return clean(s);
        }, fixNsId = function (id) {
            var ns = mw.config.get('wgFormattedNamespaces')[id.toString()];
            if (ns === undefined) {
                return false;
            } else {
                return Number(id);
            }
        }, getNsIdByName = function (ns) {
            if (typeof ns !== 'string') {
                return false;
            }
            ns = clean($.trim(ns.toLowerCase()));
            var id = mw.config.get('wgNamespaceIds')[ns];
            if (id === undefined) {
                mw.log('mw.Title: Unrecognized namespace: ' + ns);
                return false;
            }
            return fixNsId(id);
        }, setAll = function (title, s) {
            var matches = s.match(/^(?:([^:]+):)?(.*?)(?:\.(\w+))?$/), nsMatch = getNsIdByName(matches[1]);
            if (nsMatch && typeof matches[2] === 'string' && matches[2] !== '') {
                title.ns = nsMatch;
                title.name = fixName(matches[2]);
                if (typeof matches[3] === 'string' && matches[3] !== '') {
                    title.ext = fixExt(matches[3]);
                }
            } else {
                title.ns = 0;
                setNameAndExtension(title,
                    s);
            }
            return title;
        }, setNameAndExtension = function (title, raw) {
            var matches = raw.match(/^(?:)?(.*?)(?:\.(\w+))?$/);
            if (typeof matches[1] === 'string' && matches[1] !== '') {
                title.name = fixName(matches[1]);
                if (typeof matches[2] === 'string' && matches[2] !== '') {
                    title.ext = fixExt(matches[2]);
                }
            } else {
                throw new Error('mw.Title: Could not parse title "' + raw + '"');
            }
            return title;
        };
        Title.exists = function (title) {
            var type = $.type(title), obj = Title.exist.pages, match;
            if (type === 'string') {
                match = obj[title];
            } else if (type === 'object' && title instanceof Title) {
                match = obj[title.toString()];
            } else {
                throw new Error('mw.Title.exists: title must be a string or an instance of Title');
            }
            if (typeof match === 'boolean') {
                return match;
            }
            return null;
        };
        Title.exist = {
            pages: {}, set: function (titles, state) {
                titles = $.isArray(titles) ? titles : [titles];
                state = state === undefined ? true : !!state;
                var pages = this.pages, i, len = titles.length;
                for (i = 0; i < len; i++) {
                    pages[titles[i]] = state;
                }
                return true;
            }
        };
        fn = {
            constructor: Title, getNamespaceId: function () {
                return this.ns;
            },
            getNamespacePrefix: function () {
                return mw.config.get('wgFormattedNamespaces')[this.ns].replace(/ /g, '_') + (this.ns === 0 ? '' : ':');
            }, getName: function () {
                if ($.inArray(this.ns, mw.config.get('wgCaseSensitiveNamespaces')) !== -1) {
                    return this.name;
                } else {
                    return $.ucFirst(this.name);
                }
            }, getNameText: function () {
                return text(this.getName());
            }, getPrefixedDb: function () {
                return this.getNamespacePrefix() + this.getMain();
            }, getPrefixedText: function () {
                return text(this.getPrefixedDb());
            }, getMain: function () {
                return this.getName() + this.getDotExtension();
            }, getMainText: function () {
                return text(this.getMain());
            }, getExtension: function () {
                return this.ext;
            }, getDotExtension: function () {
                return this.ext === null ? '' : '.' + this.ext;
            }, getUrl: function () {
                return mw.util.wikiGetlink(this.toString());
            }, exists: function () {
                return Title.exists(this);
            }
        };
        fn.toString = fn.getPrefixedDb;
        fn.toText = fn.getPrefixedText;
        Title.prototype = fn;
        mw.Title = Title;
    }(mediaWiki, jQuery));
    ;
}, {}, {});
mw.loader.implement("mediawiki.api", function () {
    (function (mw, $) {
        var
            defaultOptions = {
                parameters: {action: 'query', format: 'json'},
                ajax: {url: mw.util.wikiScript('api'), timeout: 30 * 1000, dataType: 'json'}
            };
        mw.Api = function (options) {
            if (options === undefined) {
                options = {};
            }
            if (options.ajax && options.ajax.url !== undefined) {
                options.ajax.url = String(options.ajax.url);
            }
            options.parameters = $.extend({}, defaultOptions.parameters, options.parameters);
            options.ajax = $.extend({}, defaultOptions.ajax, options.ajax);
            this.defaults = options;
        };
        mw.Api.prototype = {
            normalizeAjaxOptions: function (arg) {
                var opts = arg || {};
                if (typeof arg === 'function') {
                    opts = {ok: arg};
                }
                return opts;
            }, get: function (parameters, ajaxOptions) {
                ajaxOptions = this.normalizeAjaxOptions(ajaxOptions);
                ajaxOptions.type = 'GET';
                return this.ajax(parameters, ajaxOptions);
            }, post: function (parameters, ajaxOptions) {
                ajaxOptions = this.normalizeAjaxOptions(ajaxOptions);
                ajaxOptions.type = 'POST';
                return this.ajax(parameters, ajaxOptions);
            }, ajax: function (parameters, ajaxOptions) {
                var token, apiDeferred = $.Deferred();
                parameters = $.extend({}, this.defaults.parameters,
                    parameters);
                ajaxOptions = $.extend({}, this.defaults.ajax, ajaxOptions);
                if (parameters.token) {
                    token = parameters.token;
                    delete parameters.token;
                }
                ajaxOptions.data = $.param(parameters).replace(/\./g, '%2E');
                if (token) {
                    ajaxOptions.data += '&token=' + encodeURIComponent(token);
                }
                if (ajaxOptions.ok) {
                    apiDeferred.done(ajaxOptions.ok);
                    delete ajaxOptions.ok;
                }
                if (ajaxOptions.err) {
                    apiDeferred.fail(ajaxOptions.err);
                    delete ajaxOptions.err;
                }
                $.ajax(ajaxOptions).fail(function (xhr, textStatus, exception) {
                    apiDeferred.reject('http', {xhr: xhr, textStatus: textStatus, exception: exception});
                }).done(function (result) {
                    if (result === undefined || result === null || result === '') {
                        apiDeferred.reject('ok-but-empty', 'OK response but empty result (check HTTP headers?)');
                    } else if (result.error) {
                        var code = result.error.code === undefined ? 'unknown' : result.error.code;
                        apiDeferred.reject(code, result);
                    } else {
                        apiDeferred.resolve(result);
                    }
                });
                return apiDeferred.promise().fail(function (code, details) {
                    mw.log('mw.Api error: ', code, details);
                });
            }
        };
        mw.Api.errors = [
            'ok-but-empty', 'timeout', 'duplicate', 'duplicate-archive', 'noimageinfo', 'uploaddisabled', 'nomodule', 'mustbeposted', 'badaccess-groups', 'stashfailed', 'missingresult', 'missingparam', 'invalid-file-key', 'copyuploaddisabled', 'mustbeloggedin', 'empty-file', 'file-too-large', 'filetype-missing', 'filetype-banned', 'filetype-banned-type', 'filename-tooshort', 'illegal-filename', 'verification-error', 'hookaborted', 'unknown-error', 'internal-error', 'overwrite', 'badtoken', 'fetchfileerror', 'fileexists-shared-forbidden', 'invalidtitle', 'notloggedin'];
        mw.Api.warnings = ['duplicate', 'exists'];
    }(mediaWiki, jQuery));
    ;
}, {}, {});
mw.loader.implement("mediawiki.hidpi", function () {
    jQuery(function ($) {
        $('body').hidpi();
    });
    ;
}, {}, {});
mw.loader.implement("mediawiki.searchSuggest", function () {
    (function (mw, $) {
        $(document).ready(function ($) {
            var map, resultRenderCache, searchboxesSelectors, $searchRegion = $('#simpleSearch, #searchInput').first(),
                $searchInput = $('#searchInput');
            map = {
                browsers: {
                    ltr: {
                        opera: [['>=', 9.6]], docomo: false, blackberry:
                            false, ipod: false, iphone: false
                    }, rtl: {opera: [['>=', 9.6]], docomo: false, blackberry: false, ipod: false, iphone: false}
                }
            };
            if (!$.client.test(map)) {
                return;
            }

            function computeResultRenderCache(context) {
                var $form, formAction, baseHref, linkParams;
                $form = context.config.$region.closest('form');
                formAction = $form.attr('action');
                baseHref = formAction + (formAction.match(/\?/) ? '&' : '?');
                linkParams = {};
                $.each($form.serializeArray(), function (idx, obj) {
                    linkParams[obj.name] = obj.value;
                });
                return {textParam: context.data.$textbox.attr('name'), linkParams: linkParams, baseHref: baseHref};
            }

            function renderFunction(text, context) {
                if (!resultRenderCache) {
                    resultRenderCache = computeResultRenderCache(context);
                }
                resultRenderCache.linkParams[resultRenderCache.textParam] = text;
                this.append($('<span>').css('whiteSpace', 'nowrap').text(text)).wrap($('<a>').attr('href', resultRenderCache.baseHref + $.param(resultRenderCache.linkParams)).addClass('mw-searchSuggest-link'));
            }

            function specialRenderFunction(query, context) {
                var $el = this;
                if (!resultRenderCache) {
                    resultRenderCache = computeResultRenderCache(context);
                }
                resultRenderCache.linkParams[resultRenderCache.textParam] = query;
                if ($el.children().length === 0) {
                    $el.append($('<div>').addClass('special-label').text(mw.msg('searchsuggest-containing')), $('<div>').addClass('special-query').text(query).autoEllipsis()).show();
                } else {
                    $el.find('.special-query').text(query).autoEllipsis();
                }
                if ($el.parent().hasClass('mw-searchSuggest-link')) {
                    $el.parent().attr('href', resultRenderCache.baseHref + $.param(resultRenderCache.linkParams) + '&fulltext=1');
                } else {
                    $el.wrap($('<a>').attr('href', resultRenderCache.baseHref + $.param(resultRenderCache.linkParams) + '&fulltext=1').addClass('mw-searchSuggest-link'));
                }
            }

            searchboxesSelectors = ['#searchInput', '#searchInput2', '#powerSearchText', '#searchText', '.mw-searchInput'];
            $(searchboxesSelectors.join(', ')).suggestions({
                fetch: function (query) {
                    var $el, jqXhr;
                    if (query.length !== 0) {
                        $el = $(this);
                        jqXhr = $.ajax({
                            url: mw.util.wikiScript('api'), data: {
                                format: 'json', action: 'opensearch', search: query,
                                namespace: 0, suggest: ''
                            }, dataType: 'json', success: function (data) {
                                if ($.isArray(data) && data.length) {
                                    $el.suggestions('suggestions', data[1]);
                                }
                            }
                        });
                        $el.data('request', jqXhr);
                    }
                }, cancel: function () {
                    var jqXhr = $(this).data('request');
                    if (jqXhr && $.isFunction(jqXhr.abort)) {
                        jqXhr.abort();
                        $(this).removeData('request');
                    }
                }, result: {
                    render: renderFunction, select: function ($input) {
                        $input.closest('form').submit();
                    }
                }, delay: 120, highlightInput: true
            }).bind('paste cut drop', function () {
                $(this).trigger('keypress');
            });
            if ($searchRegion.length === 0) {
                return;
            }
            $searchInput.attr('placeholder', mw.msg('searchsuggest-search')).placeholder();
            $searchInput.suggestions({
                result: {
                    render: renderFunction, select: function ($input) {
                        $input.closest('form').submit();
                    }
                }, special: {
                    render: specialRenderFunction, select: function ($input) {
                        $input.closest('form').append($('<input type="hidden" name="fulltext" value="1"/>'));
                        $input.closest('form').submit();
                    }
                }, $region: $searchRegion
            });
            $searchInput.data('suggestions-context').data.$container.css('fontSize',
                $searchInput.css('fontSize'));
        });
    }(mediaWiki, jQuery));
    ;
}, {"css": [".suggestions a.mw-searchSuggest-link,.suggestions a.mw-searchSuggest-link:hover,.suggestions a.mw-searchSuggest-link:active,.suggestions a.mw-searchSuggest-link:focus{text-decoration:none;color:black}.suggestions-result-current a.mw-searchSuggest-link,.suggestions-result-current a.mw-searchSuggest-link:hover,.suggestions-result-current a.mw-searchSuggest-link:active,.suggestions-result-current a.mw-searchSuggest-link:focus{color:white}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:52b1797f70c7e4094dfa4191101944e8 */"]}, {
    "searchsuggest-search": "Search",
    "searchsuggest-containing": "containing..."
});
mw.loader.implement("mediawiki.user", function () {
    (function (mw, $) {
        function User(options, tokens) {
            var user, callbacks;
            user = this;
            callbacks = {};

            function getUserInfo(info, callback) {
                var api;
                if (callbacks[info]) {
                    callbacks[info].add(callback);
                    return;
                }
                callbacks.rights = $.Callbacks('once memory');
                callbacks.groups = $.Callbacks(
                    'once memory');
                callbacks[info].add(callback);
                api = new mw.Api();
                api.get({action: 'query', meta: 'userinfo', uiprop: 'rights|groups'}).always(function (data) {
                    var rights, groups;
                    if (data.query && data.query.userinfo) {
                        rights = data.query.userinfo.rights;
                        groups = data.query.userinfo.groups;
                    }
                    callbacks.rights.fire(rights || []);
                    callbacks.groups.fire(groups || []);
                });
            }

            this.options = options || new mw.Map();
            this.tokens = tokens || new mw.Map();
            this.generateRandomSessionId = function () {
                var i, r, id = '', seed = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
                for (i = 0; i < 32; i++) {
                    r = Math.floor(Math.random() * seed.length);
                    id += seed.substring(r, r + 1);
                }
                return id;
            };
            this.getName = function () {
                return mw.config.get('wgUserName');
            };
            this.name = function () {
                return this.getName();
            };
            this.getRegistration = function () {
                var registration = mw.config.get('wgUserRegistration');
                if (this.isAnon()) {
                    return false;
                } else if (registration === null) {
                    return null;
                } else {
                    return new Date(registration);
                }
            };
            this.isAnon = function () {
                return user.getName() === null;
            };
            this.anonymous = function () {
                return user.isAnon();
            };
            this.sessionId = function () {
                var sessionId = $.cookie('mediaWiki.user.sessionId');
                if (typeof sessionId === 'undefined' || sessionId === null) {
                    sessionId = user.generateRandomSessionId();
                    $.cookie('mediaWiki.user.sessionId', sessionId, {'expires': null, 'path': '/'});
                }
                return sessionId;
            };
            this.id = function () {
                var id, name = user.getName();
                if (name) {
                    return name;
                }
                id = $.cookie('mediaWiki.user.id');
                if (typeof id === 'undefined' || id === null) {
                    id = user.generateRandomSessionId();
                }
                $.cookie('mediaWiki.user.id', id, {expires: 365, path: '/'});
                return id;
            };
            this.bucket = function (key, options) {
                var cookie, parts, version, bucket, range, k, rand, total;
                options = $.extend({buckets: {}, version: 0, tracked: false, expires: 30}, options || {});
                cookie = $.cookie('mediaWiki.user.bucket:' + key);
                if (typeof cookie === 'string' && cookie.length > 2 && cookie.indexOf(':') > 0) {
                    parts = cookie.split(':');
                    if (parts.length > 1 && Number(parts[0]) === options.version) {
                        version = Number(parts[0]);
                        bucket = String(parts[1]);
                    }
                }
                if (bucket === undefined) {
                    if (!$.isPlainObject(options.buckets)) {
                        throw'Invalid buckets error. Object expected for options.buckets.';
                    }
                    version = Number(options.version);
                    range = 0;
                    for (k in options.buckets) {
                        range += options.buckets[k];
                    }
                    rand = Math.random() * range;
                    total = 0;
                    for (k in options.buckets) {
                        bucket = k;
                        total += options.buckets[k];
                        if (total >= rand) {
                            break;
                        }
                    }
                    if (options.tracked) {
                        mw.loader.using('jquery.clickTracking', function () {
                            $.trackAction('mediaWiki.user.bucket:' + key + '@' + version + ':' + bucket);
                        });
                    }
                    $.cookie('mediaWiki.user.bucket:' + key, version + ':' + bucket, {
                        'path': '/',
                        'expires': Number(options.expires)
                    });
                }
                return bucket;
            };
            this.getGroups = function (callback) {
                getUserInfo('groups', callback);
            };
            this.getRights = function (callback) {
                getUserInfo('rights', callback);
            };
        }

        mw.user = new User(mw.user.options, mw.user.tokens);
    }(mediaWiki, jQuery));
    ;
}, {}, {});
mw.loader.implement("mediawiki.action.view.postEdit", function () {
    (function (mw, $) {
        if (mw.config.get('wgAction') !== 'view') {
            return;
        }
        var cookieKey = mw.config.get('wgCookiePrefix') + 'PostEditRevision' + mw.config.get(
            'wgCurRevisionId');
        if ($.cookie(cookieKey) === '1') {
            $.cookie(cookieKey, null, {path: '/'});
            mw.config.set('wgPostEdit', true);
        }
    }(mediaWiki, jQuery));
    ;
}, {}, {});
mw.loader.implement("mediawiki.page.ready", function () {
    (function (mw, $) {
        $(function () {
            var $sortableTables;
            if (!('placeholder' in document.createElement('input'))) {
                $('input[placeholder]').placeholder();
            }
            $('.mw-collapsible').makeCollapsible();
            $sortableTables = $('table.sortable');
            if ($sortableTables.length) {
                mw.loader.using('jquery.tablesorter', function () {
                    $sortableTables.tablesorter();
                });
            }
            $('input[type=checkbox]:not(.noshiftselect)').checkboxShiftClick();
            mw.util.updateTooltipAccessKeys();
        });
    }(mediaWiki, jQuery));
    ;
}, {}, {});
mw.loader.implement("mobile.desktop", function () {
    (function ($) {
        $('.stopMobileRedirectToggle').click(function () {
            var hostname = mw.config.get('wgMFStopRedirectCookieHost'), path = mw.config.get('wgCookiePath');
            $.cookie('stopMobileRedirect', null, {path: path, domain: hostname});
        });
    })(jQuery);
    ;
}, {}, {});
mw.loader.implement("mw.MwEmbedSupport.style"
    , function () {
    }, {
        "css": [
            "#container{position:relative;min-height:100%}#container,video{width:100%;height:100%}#playerContainer{overflow:hidden;position:relative;height:100%;background:#000}#videoHolder{position:relative;overflow:hidden}.fullscreen #playerContainer{position:absolute !important;width:100% !important;height:100%! important;z-index:9999;min-height:100%;top:0;left:0;margin:0}.mwEmbedPlayer{width:100%;height:100%;overflow:hidden;position:absolute;top:0;left:0}.modal_editor{ left:10px;top:10px;right:10px;bottom:10px;position:fixed;z-index:100}.displayHTML a:visited{color:white}.loadingSpinner{width:32px;height:32px;display:block;padding:0px;background-image:url(//bits.wikimedia.org/static-1.21wmf11/extensions/MwEmbedSupport/MwEmbedModules/MwEmbedSupport/skins/common/images/loading_ani.gif?2013-03-04T18:36:40Z)}.mw-imported-resource{border:thin solid black}.kaltura-icon{background-image:url(//bits.wikimedia.org/static-1.21wmf11/extensions/MwEmbedSupport/MwEmbedModules/MwEmbedSupport/skins/common/images/kaltura_logo_sm_transparent.png?2013-03-04T18:36:40Z) !important;background-repeat:no-repeat;display:block;height:12px;width:12px;margin-top:2px !important;margin-left:3px !important}.mw-fullscreen-overlay{background:rgb(0,0,0) none repeat scroll 0% 0%;position:fixed;top:0pt;left:0pt;width:100%;height:100%;-moz-background-clip:border;-moz-background-origin:padding;-moz-background-inline-policy:continuous} .play-btn-large{width:70px;height:53px;background :url(//bits.wikimedia.org/static-1.21wmf11/extensions/MwEmbedSupport/MwEmbedModules/MwEmbedSupport/skins/common/images/player_big_play_button.png?2013-03-04T18:36:40Z);position :absolute;cursor :pointer;border :none !important;z-index :1}.play-btn-large:hover{background :url(//bits.wikimedia.org/static-1.21wmf11/extensions/MwEmbedSupport/MwEmbedModules/MwEmbedSupport/skins/common/images/player_big_play_button_hover.png?2013-03-04T18:36:40Z)}.carouselContainer{position :absolute;width :100%;z-index :2}.carouselVideoTitle{position :absolute;top :0px;left :0px;width :100%;background :rgba(0,0,0,0.8);color :white;font-size :small;font-weight :bold;z-index :2}.carouselVideoTitleText{display :block;padding :10px 10px 10px 20px}.carouselTitleDuration{position :absolute;top :0px;right :0px;padding :2px;background-color :#5A5A5A;color :#D9D9D9;font-size :smaller;z-index :2}.carouselImgTitle{position :absolute;width :100%;text-align :center;color :white;font-size :small;background :rgba(0,0,0,0.4)}.carouselImgDuration{position :absolute;top :2px;left :2px;background :rgba( 0,0,0,0.7 );color :white;padding :1px 6px;font-size :small}.carouselPrevButton,.carouselNextButton{display :block;position :absolute;bottom:23px}.carouselPrevButton{left :5px}.carouselNextButton{right:6px}.alert-container{-webkit-border-radius:3px;-moz-border-radius:3px;border-radius:3px;background-image:linear-gradient(bottom,rgb(215,215,215) 4%,rgb(230,230,230) 55%,rgb(255,255,255) 100%);background-image:-o-linear-gradient(bottom,rgb(215,215,215) 4%,rgb(230,230,230) 55%,rgb(255,255,255) 100%);background-image:-moz-linear-gradient(bottom,rgb(215,215,215) 4%,rgb(230,230,230) 55%,rgb(255,255,255) 100%);background-image:-webkit-linear-gradient(bottom,rgb(215,215,215) 4%,rgb(230,230,230) 55%,rgb(255,255,255) 100%);background-image:-ms-linear-gradient(bottom,rgb(215,215,215) 4%,rgb(230,230,230) 55%,rgb(255,255,255) 100%);background-image:-webkit-gradient(linear,left bottom,left top,color-stop(0.04,rgb(215,215,215)),color-stop(0.55,rgb(230,230,230)),color-stop(1,rgb(255,255,255)));margin:auto;position:absolute;top:0;left:0;right:0;bottom:0;max-width:80%;max-height:30%}.alert-title{background-color :#E6E6E6;padding :5px;border-bottom :1px solid #D1D1D1;font-weight :normal !important;font-size:14px !important;-webkit-border-top-left-radius:3px;-moz-border-radius-topleft:3px;border-top-left-radius:3px;-webkit-border-top-right-radius:3px;-moz-border-radius-topright:3px;border-top-right-radius:3px }.alert-message{padding :5px;font-weight :normal !important;text-align:center;font-size:14px !important}.alert-buttons-container{text-align:center;padding-bottom:5px}.alert-button{background-color:#474747;color:white;-webkit-border-radius:.5em;-moz-border-radius:.5em;border-radius:.5em;padding:2px 10px;background-image:linear-gradient(bottom,rgb(25,25,25) 4%,rgb(47,47,47) 55%,rgb(71,71,71) 68%);background-image:-o-linear-gradient(bottom,rgb(25,25,25) 4%,rgb(47,47,47) 55%,rgb(71,71,71) 68%);background-image:-moz-linear-gradient(bottom,rgb(25,25,25) 4%,rgb(47,47,47) 55%,rgb(71,71,71) 68%);background-image:-webkit-linear-gradient(bottom,rgb(25,25,25) 4%,rgb(47,47,47) 55%,rgb(71,71,71) 68%);background-image:-ms-linear-gradient(bottom,rgb(25,25,25) 4%,rgb(47,47,47) 55%,rgb(71,71,71) 68%);background-image:-webkit-gradient( linear,left bottom,left top,color-stop(0.04,rgb(25,25,25)),color-stop(0.55,rgb(47,47,47)),color-stop(0.68,rgb(71,71,71)) )}.alert-text{color :black !important}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:dff41c0ebfd1de85d2da130bb54b6c9b */"
        ]
    }, {});
mw.loader.implement("mw.PopUpMediaTransform", function () {
    (function (mw, $) {
        $(document).ready(function () {
            $('.PopUpMediaTransform a').each(function () {
                $(this).click(function (event) {
                    var $videoContainer = $(unescape($(this).parent().attr('data-videopayload')));
                    mw.addDialog({
                        'width': 'auto',
                        'height': 'auto',
                        'title': $videoContainer.find('video,audio').attr('data-mwtitle'),
                        'content': $videoContainer,
                        'close': function () {
                            var domEl = $(this).find('video,audio').get(0);
                            if (domEl && domEl.pause) {
                                domEl.pause();
                            }
                            return true;
                        }
                    }).css('overflow', 'hidden').find('video,audio').embedPlayer();
                    return false;
                });
            });
        });
    })(mediaWiki, jQuery);
    ;
}, {
    "css": [
        ".PopUpMediaTransform a .play-btn-large{position :absolute;top:50%;left :50%;width:70px;height:53px;margin-left:-35px;margin-top:-25px;background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAAA1CAMAAADLRm3ZAAABnlBMVEUAAAAAAAAAAABaWlp4eHh7e3t/f393d3eDg4N0dHRtbW2FhYVra2uJiYmNjY1nZ2eRkZFkZGSUlJRiYmKYmJhgYGCcnJxeXl5cXFyfn58AAACioqKlpaWsrKwAAACpqakAAAAAAAAAAAAAAABEREQFBQUHBwdMTEwAAAAYGBgAAAAAAAABAQEXFxcAAAAAAAAAAABxcXGoqKh3d3eampp8fHyIiIgUFBQcHBw0NDSFhYV+fn5FRUUmJiaNjY11dXWPj4+Hh4c9PT14eHifn59nZ2eBgYFISEiBgYFubm5vb28ODg4lJSVra2tiYmJoaGgEBAQmJiZmZmaLi4saGhpiYmKYmJhZWVlgYGBfX19vb29DQ0MGBgZcXFyBgYFKSkoPDw9ZWVlzc3NQUFBXV1eKiopUVFQdHR1VVVUQEBBYWFglJSVTU1NXV1cKCgosLCySkpJRUVFISEgyMjJPT08dHR2GhoY4ODhNTU09PT0MDAwuLi57e3sTExNJSUkgICBOTk4hISEbGxtTU1MoKChBQUEsLCxXV1cAAABycnIdNM6eAAAAinRSTlOzj6jO1dbX1NfU09nS2drR29Hc0N3Q3c/O3gDf3+Ce4EgIGW7HtbXKnLouq7S5cHIq1ODQ3NTXuLq/1tXEvNjT2NjC093N18bW0dC2vNHM0LW90Ne5z9rLzsrTxbXN1Me3zdDKzdfLu8y3zb3Lyba/2svFwcq618PKxLa/1LjJu8q8u8y+xsDKrdJqj5XQAAABYklEQVR4Xu3XVVNCQRjH4VdQEbvFVRAOIRl2d3d3d3d317d2GEaGOOfM1oUXPB/gN7NX/30BIYPeGMPAqDcgBMhrBUZWLwJBAcwcAriBAzfogAMdKIADBUUmmqm64JAxl2m1k/XMmZkin+YaxsxYqd9iA1OmsfDPajVDZqMgoL1jhzpTmR+k/OCQMlObG+L4dJgq050d5rKVJlOXGaHijjxzny6i94k005YqatBFlmlKEdfy1UeS+UmS0tllwc/0JEhT9WNnBuJlqCy4maE4OSO4mdFYOeO4mQm1jCnAzUyXSJqdm8fOLCRKWVomWIaVZHFrLqJlWE8Ts7lFuAzbGZF294iXYT8rnPLICcSZk5xQyjMzzTKc5wXTXFnoluFaE+TmlnYZipUBpgcA5syjjWU1Tf7I8wvbhr/6Im/vTmDLgO3D9Gn+R5+2aIbXzeABDjwgOIDZtwDIzvwsnR1xujV/AS6zSfMs2bS9AAAAAElFTkSuQmCC);background-image:url(//bits.wikimedia.org/static-1.21wmf11/extensions/TimedMediaHandler/resources/player_big_play_button.png?2013-03-04T18:36:40Z)!ie}.PopUpMediaTransform a .play-btn-large :hover{background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAAA1CAMAAADLRm3ZAAABtlBMVEUAAAAAAAAAAAC5ubm1tbWwsLC+vr6Li4vExMSrq6umpqbIyMjOzs6ioqLT09OdnZ3Y2NiZmZnc3NyWlpbh4eGSkpLn5+eQkJCNjY0AAADr6+vv7+/z8/P39/cAAAD9/f0AAAAAAAAAAAAAAAB2dnYAAAAoKCj5+flra2sMDAwAAAAAAAAAAAAAAAAAAAACAgLW1tbPz88wMDCHh4fExMS8vLxKSkpubm6vr6+qqqo0NDQQEBDCwsK1tbUmJiaysrLT09PLy8uIiIgXFxetra2+vr7r6+tycnIbGxvMzMyTk5O1tbU8PDyjo6PR0dG0tLQLCwufn58HBwc9PT2bm5shISEqKiqXl5cICAiJiYmTk5Pj4+OoqKhpaWkKCgqOjo5TU1OXl5cYGBiKioo9PT18fHwlJSWGhoYuLi6CgoIvLy+Dg4Ofn5+oqKg7OzuAgIDk5OSLi4tHR0fIyMh9fX3Z2dlycnJPT08JCQl7e3vJyclhYWFZWVl4eHhhYWEUFBS6urpqamofHx9ycnK2trZzc3N6eno1NTUsLCyKioqAgIBBQUFmZmZHR0cICAjBwcEAAACIiIg+YVJpAAAAknRSTlOzj6jt6+ru4O/p5/Hy5vPl9eT24/ji+eHgAPr7/P2e/hlICG7YLr7+07accipwq7Tw777X6erGzuLjv7fs4rzn8PDYuObr+dK57tjqwuTu6rbjtcPiur3htdvg8+jRtt7H3Lndwdi83b7bwNze5cPb9t/G7drz0Mq22e7MzdjPuOrUu9fo1NnCwN/cxdLItu6t3VahkKcAAAFlSURBVHhe7dfFcgJBFIbRGyLEXegIDBAITtzd3d3d3d3d88ZJigqFzExNyyILzgN8Vb36+wJCGrXWj4JWrUEIkMUElEwWBJwMqNk4sAIDVlACA0qQAQMygowv05fNIDNYplKNFFBnmjN+ZU5SZtrTHHJnqTKVqX8KFykyWSlO9auNxJmmZBebOSWEmZ1EN3v73USZ0ngPxyckmbpYL3n5+JnLaB5FxbiZ20heU+V4mYpwflXVNTiZ2jAhHw1G6Zm1YGEtrZIzbUEiOjqlZrr8xfRIzfQGiOmXmhkIFDEEUjPDIYJGx8YlZyZChdxNYyzDTAS/uXmsZViI4rO0jLkMKzHevtaxl2EjztPWth2wM7sJ7uQHhyTLcJTkSnFqJFuGM4WL8wvSZUiXO11dA1BnbvQ0q2lwRO4f6Db88ekn8vxiB7oM6F8Nb+//6NPmy7C6GczAgBk4G1D75ADpqJ+l1CFGt+Y3XGRJEJqP8KwAAAAASUVORK5CYII=);background-image:url(//bits.wikimedia.org/static-1.21wmf11/extensions/TimedMediaHandler/resources/player_big_play_button_hover.png?2013-03-04T18:36:40Z)!ie}.PopUpMediaTransform{position :relative;display:inline-block}li.gallerybox div.thumb div.PopUpMediaTransform{margin:0 auto}\n/* cache key: enwiki:resourceloader:filter:minify-css:7:00a8029e3c59d389ee8db8a2d45ccabe */"
    ]
}, {});
mw.loader.implement("schema.GettingStarted", function () {
    mediaWiki.eventLog.declareSchema("GettingStarted", {
        "schema": {
            "description": "Logs events related to tasks assigned to new registered users via the GettingStarted extension. In this experiment we test three different types of tasks (1. adding links, 2. copyediting, 3. improving clarity) and also control for users returning to the referral page via the returnTo link.",
            "properties": {
                "version": {"type": "integer", "required": true, "description": "Version number"},
                "action": {
                    "type": "string",
                    "required": true,
                    "enum": ["gettingstarted-impression", "gettingstarted-click", "page-impression", "page-edit-impression", "page-save-attempt", "page-save-success"],
                    "description":
                        "The actions involved in accepting a task and completing it. gettingstarted-impression and -click occur on the GettingStarted landing page, the other events occur on a page linked from the GettingStarted landing page when users visit it (either a task page or the referral page linked via returnTo); page-edit-impression also logs if user opens a protected page by clicking on [View source]  (see isProtected field below)"
                },
                "funnel": {
                    "type": "string",
                    "description": "Identifies the funnel in which a page-* action can occur",
                    "enum": ["gettingstarted-addlinks", "gettingstarted-copyedit", "gettingstarted-clarify", "returnto"]
                },
                "bucket": {
                    "type": "string",
                    "required": true,
                    "enum": ["test", "control"],
                    "description": "Identifies the experimental bucket a user is randomly assigned to."
                },
                "targetTitle": {
                    "type": "string",
                    "description": "Title of the target page the user clicks through as part of a task assignment or the returnTo button. Only available for action=gettingstarted-click events"
                },
                "pageId": {
                    "type":
                        "integer", "description": "ID of the target article the user is invited to edit, if available"
                },
                "revId": {
                    "type": "integer",
                    "description": "Current revision of the target article the user is invited to edit, if available. Is updated to the latest revision for action=page-save-success events"
                },
                "userId": {
                    "type": "integer",
                    "description": "User ID (events from anonymous users are not logged)",
                    "required": true
                },
                "isNew": {
                    "type": "boolean",
                    "description": "True if and only if user is seeing GettingStarted (action=gettingstarted-impression) immediately after successful account creation"
                },
                "isEditable": {
                    "type": "boolean",
                    "description": "True if the target article the user is invited to edit is editable based on user privileges"
                }
            }
        }, "revision": 5320430
    });
    ;
}, {}, {});
mw.loader.implement("schema.NavigationTiming", function () {
    mediaWiki.eventLog.declareSchema("NavigationTiming", {
        "schema": {
            "description": "Represents a set of client-side latency measurements provided by NavigationTiming API",
            "properties": {
                "userAgent": {
                    "type": "string", "description": "Browser\'s user-agent string", "required": true
                },
                "isAnon": {
                    "type": "boolean",
                    "description": "True if the user was anonymous; false if logged in.",
                    "required": true
                },
                "isHttps": {"type": "boolean", "description": "True if request was secure (i.e., used HTTPS)."},
                "redirectCount": {
                    "type": "integer",
                    "description": "Number of times the document request was redirected"
                },
                "originCountry": {
                    "type": "string",
                    "description": "Country in which request originated, based on GeoIP look-up."
                },
                "dnsLookup": {
                    "type": "integer",
                    "description": "Time it took to resolve names (domainLookupEnd - domainLookupStart)"
                },
                "connecting": {
                    "type": "integer",
                    "description": "Time it took to establish a connection to the server (connectEnd - connectStart)"
                },
                "sending": {
                    "type": "integer",
                    "description": "Time from start of navigation to start of fetch (fetchStart - navigationStart)"
                },
                "waiting": {
                    "type": "integer", "description":
                        "Time from immediately before browser started request to first byte of response (responseStart - requestStart)"
                },
                "redirecting": {"type": "integer", "description": "Time spent following redirects"},
                "receiving": {
                    "type": "integer",
                    "description": "Time from first byte of response to last (responseEnd - responseStart)"
                },
                "rendering": {
                    "type": "integer",
                    "description": "Time from immediately after the last byte was sent to the page fully loading (loadEventEnd - responseEnd)"
                },
                "pageId": {"type": "integer", "description": "`page_id` of requested page. Unset for special pages."},
                "revId": {"type": "integer", "description": "Revision ID of requested page. Unset for special pages."},
                "action": {
                    "type": "string",
                    "description": "Value of \'wgAction\': view\', \'submit\', \'history\', etc. Unset for special pages."
                }
            }
        }, "revision": 5323808
    });
    ;
}, {}, {});
/* cache key: enwiki:resourceloader:filter:minify-js:7:6fe11400e4bd44289619cadc66a54073 */