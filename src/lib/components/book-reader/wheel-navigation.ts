type WheelAxis = 'horizontal' | 'vertical';

interface WheelGesture {
  axis: WheelAxis;
  delta: number;
}

export function wheelPageDirection(ev: WheelEvent, verticalMode: boolean): -1 | 1 | undefined {
  const gesture = dominantWheelGesture(ev);
  if (!gesture) return undefined;

  const direction = gesture.delta < 0 ? -1 : 1;
  if (gesture.axis !== 'horizontal' || !verticalMode) return direction;
  return direction === -1 ? 1 : -1;
}

export function crossAxisWheelScroll(
  ev: WheelEvent,
  target: HTMLElement,
  fontSize: number,
  verticalMode: boolean
) {
  const gesture = dominantWheelGesture(ev);
  const naturalAxis: WheelAxis = verticalMode ? 'horizontal' : 'vertical';
  if (!gesture || gesture.axis === naturalAxis) return;

  const pageSize = verticalMode ? target.clientWidth : target.clientHeight;
  const distance = getScrollDistance(gesture.delta, ev.deltaMode, fontSize, pageSize);
  target.scrollBy(verticalMode ? -distance : 0, verticalMode ? 0 : distance);
  ev.preventDefault();
}

function dominantWheelGesture(ev: WheelEvent): WheelGesture | undefined {
  if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return undefined;

  const axis = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? 'horizontal' : 'vertical';
  const delta = axis === 'horizontal' ? ev.deltaX : ev.deltaY;
  return delta === 0 ? undefined : { axis, delta };
}

const enum DeltaMode {
  Pixel = 0,
  Line = 1
}

function getScrollDistance(delta: number, deltaMode: number, fontSize: number, pageSize: number) {
  // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode
  switch (deltaMode) {
    case DeltaMode.Pixel:
      return delta;
    case DeltaMode.Line:
      return delta * fontSize * 1.75;
    default:
      return delta * pageSize;
  }
}
