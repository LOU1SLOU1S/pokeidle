import { App } from '@capacitor/app';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const SAVE_PATH = 'save.json';
const BACKUP_PATH = 'save.json.bak';

async function readFileText(path) {
  try {
    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof data === 'string' && data ? data : null;
  } catch (_) {
    return null;
  }
}

function readSave() {
  return readFileText(SAVE_PATH);
}

// 主存档写坏/写一半时的回退源：每次落盘前把上一份转存到这里
function readSaveBackup() {
  return readFileText(BACKUP_PATH);
}

// 写入串行化：存档由 30 秒周期与多个事件同时触发，并发写会互相截断
let writeChain = Promise.resolve();

function writeSave(data) {
  writeChain = writeChain.catch(() => {}).then(async () => {
    const current = await readFileText(SAVE_PATH);
    if (current && current !== data) {
      await Filesystem.writeFile({
        path: BACKUP_PATH,
        data: current,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
    }
    await Filesystem.writeFile({
      path: SAVE_PATH,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
  });
  return writeChain;
}

async function exportSave(data) {
  const { uri } = await Filesystem.writeFile({
    path: `pokeidle-save-${Date.now()}.json`,
    data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  await Share.share({ title: '口袋挂机存档', url: uri });
}

// 后台常驻（前台服务）：常驻通知 + 进程提到前台优先级，防小米/红米这类系统清后台。
// 通知是 Android 强制的，藏不掉；开关在游戏设置里，默认关
async function foregroundStart() {
  const perm = await ForegroundService.checkPermissions();
  if (perm.display !== 'granted') await ForegroundService.requestPermissions();
  await ForegroundService.startForegroundService({
    id: 1,
    title: '口袋挂机运行中',
    body: '正在后台挂机，回到游戏可继续',
    smallIcon: 'ic_launcher',
    notificationChannelId: 'pokeidle',
    silent: true,
  });
}
async function foregroundStop() {
  await ForegroundService.stopForegroundService();
}

window.__POKEIDLE_MOBILE__ = {
  readSave,
  foregroundStart,
  foregroundStop,
  readSaveBackup,
  writeSave,
  exportSave,
  openExternal: url => Browser.open({ url }),
  exitApp: () => App.exitApp(),
  attach({ saveNow, back }) {
    App.addListener('backButton', () => back());
    App.addListener('appStateChange', ({ isActive }) => {
      // 切后台：停乐 + 立刻落盘；回前台：把被系统挂起的音频接回去
      if (isActive) window.__POKEIDLE_AUDIO_RESUME__?.();
      else {
        window.__POKEIDLE_AUDIO_PAUSE__?.();
        saveNow();
      }
    });
  },
};

document.documentElement.classList.add('mobile-app');
