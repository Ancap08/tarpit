import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#111418');

    this.add
      .text(width / 2, height / 2 - 30, 'Tarpit', {
        fontFamily: 'Georgia, serif',
        fontSize: '72px',
        color: '#f2e6c9',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 40, 'a tower defense game', {
        fontFamily: 'Georgia, serif',
        fontSize: '24px',
        color: '#a89f8a',
      })
      .setOrigin(0.5);
  }
}
