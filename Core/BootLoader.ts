import { parseSettingsCsv } from '../parseCsv.js';

export class BootLoader {
    static WindowWidth: number = 1280;
    static WindowHeight: number = 720;
    static WindowTitle: string = 'Data Driven Engine';
    static VSync: boolean = true;

    static async Load(csvPath: string = 'Core/BootLoader.csv'): Promise<void> {
        try {
            const response = await fetch(csvPath);
            if (!response.ok) throw new Error('Not found');
            const text = await response.text();
            const settings = parseSettingsCsv(text);

            if (settings['window_width'] !== undefined)
                this.WindowWidth = parseInt(settings['window_width'] as string);
            if (settings['window_height'] !== undefined)
                this.WindowHeight = parseInt(settings['window_height'] as string);
            if (settings['window_title'] !== undefined)
                this.WindowTitle = settings['window_title'] as string;
            if (settings['vsync'] !== undefined)
                this.VSync = settings['vsync'] === 'true';

            console.log(`[BootLoader] Loaded: ${this.WindowWidth}x${this.WindowHeight} '${this.WindowTitle}'`);
        } catch {
            console.warn(`[BootLoader] File not found: ${csvPath}, using defaults`);
        }
    }
}
