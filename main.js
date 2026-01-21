const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Проверяем, находится ли приложение в режиме разработки
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        show: false, // Скрываем окно пока не загрузится
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Загружаем приложение в зависимости от режима
    if (isDev) {
        // В режиме разработки - подключаемся к localhost
        mainWindow.loadURL('http://localhost:3000')
            .then(() => {
                console.log('Приложение загружено с localhost:3000');
                mainWindow.show();
                mainWindow.webContents.openDevTools();
            })
            .catch(err => {
                console.error('Не удалось загрузить приложение:', err);
                // Если React сервер не запущен, показываем сообщение
                mainWindow.loadFile(path.join(__dirname, 'public/no-server.html'));
                mainWindow.show();
            });
    } else {
        // В продакшене - загружаем собранные файлы
        mainWindow.loadFile(path.join(__dirname, 'build/index.html'))
            .then(() => {
                console.log('Приложение загружено из build/');
                mainWindow.show();
            })
            .catch(err => {
                console.error('Не удалось загрузить приложение:', err);
                mainWindow.loadFile(path.join(__dirname, 'public/no-build.html'));
                mainWindow.show();
            });
    }

    // Создаем меню
    const template = [
        {
            label: 'Файл',
            submenu: [
                {
                    label: 'Новая схема',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('new-circuit');
                        }
                    }
                },
                {
                    label: 'Очистить всё',
                    accelerator: 'CmdOrCtrl+Shift+N',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('clear-all');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Выход',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Режимы',
            submenu: [
                {
                    label: 'Режим выбора',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('set-mode', 'select');
                        }
                    }
                },
                {
                    label: 'Добавить источник',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('set-mode', 'add-power');
                        }
                    }
                },
                {
                    label: 'Добавить шину',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('set-mode', 'add-bus');
                        }
                    }
                },
                {
                    label: 'Нарисовать соединение',
                    accelerator: 'CmdOrCtrl+4',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('set-mode', 'add-connection');
                        }
                    }
                }
            ]
        },
        {
            label: 'Вид',
            submenu: [
                {
                    label: 'Показать/скрыть легенду',
                    accelerator: 'CmdOrCtrl+L',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('toggle-legend');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Увеличить',
                    accelerator: 'CmdOrCtrl+=',
                    role: 'zoomIn'
                },
                {
                    label: 'Уменьшить',
                    accelerator: 'CmdOrCtrl+-',
                    role: 'zoomOut'
                },
                {
                    label: 'Сбросить масштаб',
                    accelerator: 'CmdOrCtrl+0',
                    role: 'resetZoom'
                }
            ]
        },
        {
            label: 'Справка',
            submenu: [
                {
                    label: 'О программе',
                    click: () => {
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('show-about');
                        }
                    }
                },
                {
                    label: 'Перезагрузить',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.reload();
                        }
                    }
                },
                {
                    label: 'Инструменты разработчика',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.toggleDevTools();
                        }
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Обработка закрытия окна
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Когда приложение готово
app.whenReady().then(() => {
    console.log('Electron приложение готово');
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Закрываем приложение, когда все окна закрыты (кроме macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});