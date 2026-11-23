import type { Button } from './button';

/** Move through a menu in display order. The map follows its numbered trail. */
export function menuKeys(buttons: Button[], first: number, back?: Button) {
  let index = first;
  const pick = () => buttons.forEach((button, i) => button.setPicked(i === index));
  pick();
  // Phaser can report the same DOM event more than once within a frame.
  const seen = new WeakSet<KeyboardEvent>();
  return (event: KeyboardEvent) => {
    if (seen.has(event) || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    seen.add(event);
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        index = Math.max(0, index - 1);
        pick();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        index = Math.min(buttons.length - 1, index + 1);
        pick();
        break;
      case 'Enter':
      case ' ':
        buttons[index].activate();
        break;
      case 'Escape':
        back?.activate();
        break;
    }
  };
}
