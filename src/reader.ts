import { spawn } from 'child_process';

export interface ReaderInfo {
    index: number;
    name: string;
}

export async function getReaders(
    exePath: string
): Promise<ReaderInfo[]> {
    return new Promise((resolve, reject) => {
        const readers: ReaderInfo[] = [];
        const child = spawn(
            exePath,
            [
                '--list-reader',
                '--json'
            ]
        );

        child.stdout.on(
            'data',
            buf => {
                const lines = buf.toString().split('\n');

                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }

                    try {
                        const obj = JSON.parse(line);

                        if (obj.type === 'reader') {
                            readers.push({ index: obj.index, name: obj.name });
                        }
                    } catch {
                    }
                }
            }
        );

        child.on('close', () => { resolve(readers); });
        child.on('error', err => { reject(err); });
    });
}