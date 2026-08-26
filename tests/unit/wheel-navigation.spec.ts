import { describe, expect, it, vi } from 'vitest';
import {
  crossAxisWheelScroll,
  wheelPageDirection
} from '../../src/lib/components/book-reader/wheel-navigation.ts';

describe('wheelPageDirection', () => {
  it('uses the dominant gesture axis and reverses horizontal gestures for vertical text', () => {
    expect(wheelPageDirection(wheelEvent({ deltaX: 20, deltaY: 1 }), false)).toBe(1);
    expect(wheelPageDirection(wheelEvent({ deltaX: 20, deltaY: 1 }), true)).toBe(-1);
    expect(wheelPageDirection(wheelEvent({ deltaX: 1, deltaY: -20 }), true)).toBe(-1);
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)(
    'leaves %s gestures to the browser',
    (key) => {
      expect(wheelPageDirection(wheelEvent({ deltaY: 20, [key]: true }), false)).toBeUndefined();
    }
  );
});

describe('crossAxisWheelScroll', () => {
  it('maps the other gesture axis into each text direction', () => {
    const { target: horizontalTarget, scrollBy: horizontalScrollBy } = scrollTarget();
    const horizontalEvent = wheelEvent({ deltaX: 20, deltaY: 1 });
    crossAxisWheelScroll(horizontalEvent, horizontalTarget, 20, false);
    expect(horizontalScrollBy).toHaveBeenCalledWith(0, 20);
    expect(horizontalEvent.preventDefault).toHaveBeenCalled();

    const { target: verticalTarget, scrollBy: verticalScrollBy } = scrollTarget();
    const verticalEvent = wheelEvent({ deltaX: 1, deltaY: 20 });
    crossAxisWheelScroll(verticalEvent, verticalTarget, 20, true);
    expect(verticalScrollBy).toHaveBeenCalledWith(-20, 0);
    expect(verticalEvent.preventDefault).toHaveBeenCalled();
  });

  it('lets the browser handle the natural axis', () => {
    const { target, scrollBy } = scrollTarget();
    const verticalEvent = wheelEvent({ deltaY: 20 });
    crossAxisWheelScroll(verticalEvent, target, 20, false);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(verticalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)(
    'leaves %s gestures to the browser',
    (key) => {
      const { target, scrollBy } = scrollTarget();
      const event = wheelEvent({ deltaX: 20, [key]: true });

      crossAxisWheelScroll(event, target, 20, false);

      expect(scrollBy).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  );

  it.each([
    { deltaMode: 1, expectedDistance: 70 },
    { deltaMode: 2, expectedDistance: 1_200 }
  ])('converts delta mode $deltaMode into pixels', ({ deltaMode, expectedDistance }) => {
    const { target, scrollBy } = scrollTarget();
    const event = wheelEvent({ deltaMode, deltaX: 2 });

    crossAxisWheelScroll(event, target, 20, false);

    expect(scrollBy).toHaveBeenCalledWith(0, expectedDistance);
  });
});

function wheelEvent(overrides: Partial<WheelEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides
  } as unknown as WheelEvent;
}

function scrollTarget() {
  const scrollBy = vi.fn();
  const target = {
    clientHeight: 600,
    clientWidth: 800,
    scrollBy
  } as unknown as HTMLElement;
  return { target, scrollBy };
}
