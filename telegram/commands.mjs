/* Telegram slash-command descriptions in users' Telegram UI language.
 * Language selection inside bot is separate from Telegram client language.
 */
import { BOT_COMMANDS } from "./bot.mjs";
import { normalizeLocale } from "./i18n.mjs";
const DESCRIPTION={
  "vi": {
    "role": "Chọn nhu cầu sử dụng bot",
    "need": "Tìm mã mời và theo dõi mã mới",
    "start": "Bắt đầu và mở menu",
    "codes": "Xem mã mới công bố",
    "status": "Kiểm tra trạng thái mã",
    "submit": "Đóng góp mã công khai",
    "report": "Báo cáo sử dụng mã",
    "count": "Cập nhật lượt mời qua GitHub",
    "privacy": "Quy tắc riêng tư và công khai",
    "get": "Xem và sao chép một mã",
    "search": "Tìm kiếm mã",
    "new": "Các mã vừa công bố",
    "my": "Các mã bạn đã gửi",
    "watch": "Theo dõi một mã",
    "unwatch": "Bỏ theo dõi mã",
    "watchlist": "Danh sách đang theo dõi",
    "subscribe": "Bật thông báo mã mới",
    "unsubscribe": "Tắt thông báo mã mới",
    "settings": "Cài đặt bot",
    "language": "Đổi ngôn ngữ",
    "delete_data": "Xóa dữ liệu bot riêng tư",
    "cancel": "Hủy thao tác"
  },
  "ja": {
    "role": "利用目的を選択",
    "need": "招待コードを探して新着通知を設定",
    "start": "開始・メニューを表示",
    "codes": "最近公開されたコード",
    "status": "コードの状態を確認",
    "submit": "公開コードを投稿",
    "report": "コードの利用結果を報告",
    "count": "GitHub所有者の残数更新",
    "privacy": "プライバシーと公開ルール",
    "get": "コードを表示・コピー",
    "search": "コードを検索",
    "new": "新着コードを表示",
    "my": "自分の投稿履歴",
    "watch": "コードをフォロー",
    "unwatch": "フォローを解除",
    "watchlist": "フォロー中のコード",
    "subscribe": "新着通知をオン",
    "unsubscribe": "新着通知をオフ",
    "settings": "ボット設定",
    "language": "表示言語を変更",
    "delete_data": "個人データを削除",
    "cancel": "操作をキャンセル"
  }
};
export function commandsFor(language="en") {
  const locale=normalizeLocale(language);
  return BOT_COMMANDS.map(({command,description})=>({
    command,description:DESCRIPTION[locale]?.[command]||description
  }));
}
