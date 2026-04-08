const RIPPLE_ANIMATION_DURATION = 400;
const RIPPLE_EASING = 'linear';
const RIPPLE_OVERLAY_TRANSITION = 'opacity 400ms cubic-bezier(0.23, 1, 0.32, 1)';
const RIPPLE_COLOR = 'rgb(156 163 175)';

function createSurface() {
  const surface = document.createElement('span');
  surface.setAttribute('aria-hidden', 'true');
  surface.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  `;

  return surface;
}

function createOverlay(opacity: number) {
  const overlay = document.createElement('span');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background-color: ${RIPPLE_COLOR};
    opacity: 0;
    transition: ${RIPPLE_OVERLAY_TRANSITION};
  `;
  overlay.dataset.rippleOpacity = `${opacity}`;

  return overlay;
}

function createRippleNode(diameter: number, left: number, top: number) {
  const rippleNode = document.createElement('span');
  rippleNode.setAttribute('aria-hidden', 'true');
  rippleNode.style.cssText = `
    position: absolute;
    border-radius: 9999px;
    background-color: ${RIPPLE_COLOR};
    opacity: 0.5;
    width: ${diameter}px;
    height: ${diameter}px;
    top: ${top}px;
    left: ${left}px;
    transform: scale(0);
  `;

  return rippleNode;
}

function setOverlayVisible(overlay: HTMLElement, visible: boolean) {
  overlay.style.opacity = visible ? (overlay.dataset.rippleOpacity ?? '0') : '0';
}

export function ripple(node: HTMLElement) {
  const hadRelativeClass = node.classList.contains('relative');
  const hadOverflowHiddenClass = node.classList.contains('overflow-hidden');
  const surface = createSurface();
  const holdOverlay = createOverlay(0.25);
  const focusOverlay = createOverlay(0.1);

  let hold = false;
  let focus = false;

  node.classList.add('relative', 'overflow-hidden');
  surface.append(holdOverlay, focusOverlay);
  node.append(surface);

  function renderState() {
    setOverlayVisible(holdOverlay, hold);
    setOverlayVisible(focusOverlay, hold || focus);
  }

  function createRippleAtPoint(clientX: number, clientY: number) {
    const rect = node.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height);
    const radius = diameter / 2;
    const rippleLeft = clientX - rect.left - radius;
    const rippleTop = clientY - rect.top - radius;
    const rippleNode = createRippleNode(diameter, rippleLeft, rippleTop);

    surface.prepend(rippleNode);
    rippleNode
      .animate(
        [
          { transform: 'scale(0)', opacity: '0.5' },
          { transform: 'scale(4)', opacity: '0' }
        ],
        {
          duration: RIPPLE_ANIMATION_DURATION,
          easing: RIPPLE_EASING
        }
      )
      .finished.catch(() => undefined)
      .finally(() => rippleNode.remove());

    hold = true;
    focus = false;
    renderState();
  }

  function handleFocusIn() {
    focus = true;
    renderState();
  }

  function handleFocusOut() {
    focus = false;
    renderState();
  }

  function handleMouseEnter() {
    focus = true;
    renderState();
  }

  function handleMouseLeave() {
    hold = false;
    focus = false;
    renderState();
  }

  function handleMouseDown(event: MouseEvent) {
    createRippleAtPoint(event.clientX, event.clientY);
  }

  function handleMouseUp() {
    hold = false;
    renderState();
  }

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    createRippleAtPoint(touch.clientX, touch.clientY);
  }

  function handleTouchEnd() {
    hold = false;
    renderState();
  }

  node.addEventListener('focusin', handleFocusIn);
  node.addEventListener('focusout', handleFocusOut);
  node.addEventListener('mouseenter', handleMouseEnter);
  node.addEventListener('mouseleave', handleMouseLeave);
  node.addEventListener('mousedown', handleMouseDown);
  node.addEventListener('mouseup', handleMouseUp);
  node.addEventListener('touchstart', handleTouchStart);
  node.addEventListener('touchend', handleTouchEnd);
  node.addEventListener('touchcancel', handleTouchEnd);

  return {
    destroy() {
      node.removeEventListener('focusin', handleFocusIn);
      node.removeEventListener('focusout', handleFocusOut);
      node.removeEventListener('mouseenter', handleMouseEnter);
      node.removeEventListener('mouseleave', handleMouseLeave);
      node.removeEventListener('mousedown', handleMouseDown);
      node.removeEventListener('mouseup', handleMouseUp);
      node.removeEventListener('touchstart', handleTouchStart);
      node.removeEventListener('touchend', handleTouchEnd);
      node.removeEventListener('touchcancel', handleTouchEnd);

      surface.remove();

      if (!hadRelativeClass) {
        node.classList.remove('relative');
      }

      if (!hadOverflowHiddenClass) {
        node.classList.remove('overflow-hidden');
      }
    }
  };
}
