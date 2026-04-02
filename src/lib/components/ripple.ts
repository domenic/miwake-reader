/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Action } from 'svelte/action';

export const ripple: Action<HTMLElement> = (node) => {
  const addedClasses = ['relative', 'overflow-hidden'].filter((className) => {
    if (node.classList.contains(className)) return false;
    node.classList.add(className);
    return true;
  });

  const container = document.createElement('span');
  container.className = 'pointer-events-none absolute inset-0 h-full w-full';

  const holdOverlay = document.createElement('span');
  holdOverlay.className =
    'absolute inset-0 h-full w-full bg-gray-400/25 opacity-0 transition-opacity duration-150';

  const focusOverlay = document.createElement('span');
  focusOverlay.className =
    'absolute inset-0 h-full w-full bg-gray-400/[.10] opacity-0 transition-opacity duration-150';

  container.append(holdOverlay, focusOverlay);
  node.append(container);

  let hold = false;
  let focus = false;

  const render = () => {
    holdOverlay.style.opacity = hold ? '1' : '0';
    focusOverlay.style.opacity = hold || focus ? '1' : '0';
  };

  const createRipple = (eventX: number, eventY: number) => {
    const rect = node.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height);
    const radius = diameter / 2;

    const rippleEl = document.createElement('span');
    rippleEl.className = 'absolute rounded-full bg-gray-400/50';
    rippleEl.style.width = `${diameter}px`;
    rippleEl.style.height = `${diameter}px`;
    rippleEl.style.left = `${eventX - rect.left - radius}px`;
    rippleEl.style.top = `${eventY - rect.top - radius}px`;
    rippleEl.style.transform = 'scale(0)';
    rippleEl.style.opacity = '1';

    container.prepend(rippleEl);

    const animation = rippleEl.animate(
      [
        { transform: 'scale(0)', opacity: 1 },
        { transform: 'scale(4)', opacity: 0 }
      ],
      { duration: 400, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    );

    animation.addEventListener('finish', () => rippleEl.remove(), { once: true });

    hold = true;
    focus = false;
    render();
  };

  const onFocusIn = () => {
    focus = true;
    render();
  };

  const onFocusOut = () => {
    focus = false;
    render();
  };

  const onMouseEnter = () => {
    focus = true;
    render();
  };

  const onMouseLeave = () => {
    hold = false;
    focus = false;
    render();
  };

  const onMouseDown = (event: MouseEvent) => createRipple(event.clientX, event.clientY);

  const onMouseUp = () => {
    hold = false;
    render();
  };

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    createRipple(touch.clientX, touch.clientY);
  };

  const onTouchEnd = () => {
    hold = false;
    render();
  };

  node.addEventListener('focusin', onFocusIn);
  node.addEventListener('focusout', onFocusOut);
  node.addEventListener('mouseenter', onMouseEnter);
  node.addEventListener('mouseleave', onMouseLeave);
  node.addEventListener('mousedown', onMouseDown);
  node.addEventListener('mouseup', onMouseUp);
  node.addEventListener('touchstart', onTouchStart);
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', onTouchEnd);

  return {
    destroy() {
      node.removeEventListener('focusin', onFocusIn);
      node.removeEventListener('focusout', onFocusOut);
      node.removeEventListener('mouseenter', onMouseEnter);
      node.removeEventListener('mouseleave', onMouseLeave);
      node.removeEventListener('mousedown', onMouseDown);
      node.removeEventListener('mouseup', onMouseUp);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
      container.remove();
      addedClasses.forEach((className) => node.classList.remove(className));
    }
  };
};
