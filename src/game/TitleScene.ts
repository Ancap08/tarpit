import Phaser from 'phaser';
import { COLORS, FONT, TEXT } from './palette';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.titleBg);

    this.add
      .text(width / 2, height / 2 - 50, 'Tarpit', {
        fontFamily: FONT,
        fontSize: '72px',
        fontStyle: 'bold',
        color: TEXT.title,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 20, 'a tower defense game', {
        fontFamily: FONT,
        fontSize: '24px',
        color: TEXT.subtitle,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 100, 'Click to start', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: TEXT.prompt,
      })
      .setOrigin(0.5);

    const start = () => this.scene.start('game');
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);
  }
}
