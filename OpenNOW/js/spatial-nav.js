/**
 * Spatial Navigation engine for webOS Smart TV remote control inputs (ES5 Compatible)
 */
function SpatialNavigation() {
  this.currentFocus = null;
  this.focusableSelector = '.focusable';
  this.init();
}

SpatialNavigation.prototype.init = function() {
  var self = this;
  document.addEventListener('keydown', function(e) {
    self.handleKeyDown(e);
  });
  
  document.addEventListener('mouseover', function(e) {
    var target = e.target.closest(self.focusableSelector);
    if (target) {
      self.focusElement(target);
    }
  });
};

SpatialNavigation.prototype.getFocusableElements = function() {
  var self = this;
  var elements = Array.prototype.slice.call(document.querySelectorAll(this.focusableSelector));
  return elements.filter(function(el) {
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return rect.width > 0 && 
           rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           !el.disabled;
  });
};

SpatialNavigation.prototype.focusElement = function(el) {
  if (this.currentFocus) {
    this.currentFocus.classList.remove('focused');
    this.currentFocus.blur();
  }
  this.currentFocus = el;
  if (el) {
    el.classList.add('focused');
    el.focus();
    // Scroll into view if it goes outside the viewport
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
};

SpatialNavigation.prototype.handleKeyDown = function(e) {
  var key = e.key;
  var keyCode = e.keyCode;
  var elements = this.getFocusableElements();
  if (elements.length === 0) return;

  // Map keycode to direction string (for webOS 2.2.0 compatibility)
  var direction = null;
  if (keyCode === 38 || key === 'ArrowUp') direction = 'ArrowUp';
  else if (keyCode === 40 || key === 'ArrowDown') direction = 'ArrowDown';
  else if (keyCode === 37 || key === 'ArrowLeft') direction = 'ArrowLeft';
  else if (keyCode === 39 || key === 'ArrowRight') direction = 'ArrowRight';

  // If nothing is focused, focus the first item
  if (!this.currentFocus || elements.indexOf(this.currentFocus) === -1) {
    this.focusElement(elements[0]);
    return;
  }

  if (direction) {
    e.preventDefault();
    var next = this.findClosestElement(direction);
    if (next) {
      this.focusElement(next);
    }
  } else if (keyCode === 13 || key === 'Enter') {
    e.preventDefault();
    if (this.currentFocus) {
      if (typeof this.currentFocus.click === 'function') {
        this.currentFocus.click();
      } else {
        var clickEvent = document.createEvent('MouseEvents');
        clickEvent.initEvent('click', true, true);
        this.currentFocus.dispatchEvent(clickEvent);
      }
    }
  } else if (keyCode === 27 || keyCode === 461 || key === 'Escape' || key === 'Back') { // 461 is the webOS TV Back button keycode
    e.preventDefault();
    if (window.handleBackKey) {
      window.handleBackKey();
    }
  }
};

SpatialNavigation.prototype.findClosestElement = function(direction) {
  var curRect = this.currentFocus.getBoundingClientRect();
  var curX = curRect.left + curRect.width / 2;
  var curY = curRect.top + curRect.height / 2;

  var self = this;
  var elements = this.getFocusableElements().filter(function(el) {
    return el !== self.currentFocus;
  });
  var bestEl = null;
  var minScore = Infinity;

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var rect = el.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;

    var dx = x - curX;
    var dy = y - curY;

    var isValid = false;
    if (direction === 'ArrowLeft' && dx < -5) isValid = true;
    if (direction === 'ArrowRight' && dx > 5) isValid = true;
    if (direction === 'ArrowUp' && dy < -5) isValid = true;
    if (direction === 'ArrowDown' && dy > 5) isValid = true;

    if (!isValid) continue;

    // Distance score calculation
    var distance = Math.sqrt(dx * dx + dy * dy);
    
    // Add penalty for deviation from the direction axis (prefer straight moves)
    var deviationPenalty = 1;
    if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
      deviationPenalty = 1 + 4 * (Math.abs(dy) / (Math.abs(dx) || 1));
    } else {
      deviationPenalty = 1 + 4 * (Math.abs(dx) / (Math.abs(dy) || 1));
    }

    var score = distance * deviationPenalty;
    if (score < minScore) {
      minScore = score;
      bestEl = el;
    }
  }

  return bestEl;
};

SpatialNavigation.prototype.resetFocus = function() {
  var elements = this.getFocusableElements();
  if (elements.length > 0) {
    this.focusElement(elements[0]);
  } else {
    this.currentFocus = null;
  }
};

window.spatialNavigation = new SpatialNavigation();
