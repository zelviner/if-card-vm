import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getReaders } from './reader';

export function activate(context: vscode.ExtensionContext) {

	const output = vscode.window.createOutputChannel('IF Card VM');
	const readerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

	readerStatusBar.command = 'if-card-vm.selectReader';
	readerStatusBar.text = '$(credit-card) No Reader';
	readerStatusBar.tooltip = 'Current Card Reader';
	readerStatusBar.show();

	let currentReader: any = undefined;

	const exePath = path.join(context.extensionPath, 'bin', 'card_device_server.exe');

	// 选择读卡器
	async function selectReader() {
		const readers = await getReaders(exePath);

		if (readers.length === 0) {
			vscode.window.showErrorMessage(
				'No card reader found'
			);
			return undefined;
		}

		const selected = await vscode.window.showQuickPick(
			readers.map(r => ({
				label: r.name,
				description: `index: ${r.index}`,
				reader: r
			})),

			{
				placeHolder: 'Select card reader'
			}
		);

		if (!selected) {
			return undefined;
		}

		currentReader = selected.reader;
		readerStatusBar.text = `$(credit-card) ${selected.reader.name}`;
		readerStatusBar.tooltip = `Reader Index: ${selected.reader.index}`;

		return selected.reader;
	}

	// 状态栏点击
	const selectReaderCmd = vscode.commands.registerCommand(
		'if-card-vm.selectReader',
		async () => {
			await selectReader();
		}
	);

	// 运行脚本
	const runCmd = vscode.commands.registerCommand(
		'if-card-vm.run',
		async (uri: vscode.Uri) => {
			if (!uri) {
				vscode.window.showErrorMessage('No script file selected');
				return;
			}

			output.clear();
			output.show();

			output.appendLine('[INFO] start script');
			output.appendLine(`[INFO] exe: ${exePath}`);
			output.appendLine(`[INFO] script: ${uri.fsPath}`);

			const config = vscode.workspace.getConfiguration('if-card-vm');
			const readerType = config.get<number>('readerType', 0);
			const protocol = config.get<number>('protocol', 1);
			const convert = config.get<boolean>('convert', false);
			const dataFile = config.get<string>('dataFile', '');

			// 如果还没选择读卡器
			if (!currentReader) {
				const reader = await selectReader();

				if (!reader) {
					return;
				}
			}

			const args = [
				'--json',

				'--script',
				uri.fsPath,

				'--reader-type',
				String(readerType),

				'--reader-index',
				String(currentReader.index),

				'--protocol',
				String(protocol),

				'--convert',
				String(convert)
			];

			if (dataFile) {
				args.push('--data', dataFile);
			}

			output.appendLine('[INFO] args: ' + JSON.stringify(args));
			const child = spawn(exePath, args);
			let stdoutBuffer = '';

			// stdout
			child.stdout.on(
				'data',
				buf => {
					stdoutBuffer += buf.toString();

					const lines = stdoutBuffer.split('\n');
					stdoutBuffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.trim()) {
							continue;
						}

						try {
							const obj = JSON.parse(line);

							switch (obj.type) {
								case 'info':
									output.appendLine(`[INFO] ${obj.message}`);
									break;

								case 'error':
									output.appendLine(`[ERROR] ${obj.message}`);
									break;

								case 'log':
									output.appendLine(obj.message);
									break;

								case 'apdu':
									output.appendLine(`${obj.cmd} -> ${obj.rsp}`);
									break;

								case 'reader':
									output.appendLine(`[READER] ${obj.name}`);
									break;

								default:
									output.appendLine(line);
									break;
							}

						} catch {
							output.appendLine(line);
						}
					}
				}
			);

			// stderr
			child.stderr.on(
				'data',
				buf => { output.appendLine('[STDERR] ' + buf.toString()); }
			);

			// exit
			child.on(
				'close',
				code => { output.appendLine(`[INFO] process exit: ${code}`); }
			);

			// error
			child.on(
				'error',
				err => { output.appendLine(`[ERROR] ${err.message}`); }
			);
		}
	);

	context.subscriptions.push(runCmd);
	context.subscriptions.push(selectReaderCmd);
	context.subscriptions.push(readerStatusBar);
}

export function deactivate() { }