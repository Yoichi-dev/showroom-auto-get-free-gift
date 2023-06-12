'use strict';

require('dotenv').config();
const axios = require('axios');

// 設定
const env = process.env;
const interval = 26000;
const baseURL = 'https://www.showroom-live.com';
const client = axios.create({ baseURL });
const config = {
  headers: {
    'Accept-Language': 'ja',
    cookie: `sr_id=${env.sr_id}`
  },
  params: {
    room_id: 317313
  }
};
const configOnlive = {
  headers: {
    'Accept-Language': 'ja'
  }
};

const freeGiftName = ['黄', '橙', '紫', '緑', '青'];

const inputText = () => {
  return new Promise((resolve, reject) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    readline.question('\n入力してください：', (answer) => {
      readline.close();
      resolve(Number(answer));
    });
  });
};

(async () => {

  try {
    // オンライブ一覧取得
    console.log("\nオンライブ一覧を取得します");

    const onliveAPI = await client
      .get(`/api/live/onlives?_=${new Date().getTime()}`, configOnlive)
      .then(result => result.data);

    console.log("\n星と種どちらを取得しますか？");
    console.log("【星】：0");
    console.log("【種】：1");

    // 入力
    const inputGift = await inputText();

    // チェック
    if (isNaN(inputGift)) throw new Error("数字を入力してください");
    if (!(inputGift === 0 || inputGift === 1)) throw new Error("星「0」か種「1」を入力してください");

    console.log(`\n${inputGift === 0 ? "星" : "種"}が選択されました`);

    // ログインチェック
    config.params.room_id = inputGift === 0 ? onliveAPI.onlives[2].lives[0].room_id : onliveAPI.onlives[1].lives[0].room_id;
    const login = await client
      .get('/api/live/current_user', config)
      .then(result => {
        return result.data;
      });

    if (!login.is_login) throw new Error("ログインしていません");

    console.log("\n【ログイン中の情報】");
    console.log(`ユーザーID：${login.user_id}`);
    console.log(`ユーザー名：${login.name}`);
    console.log("\n【獲得済みギフト情報】");

    // 取得済みギフト一覧表示
    let minGiftNum = 100;
    login.gift_list.normal.forEach((gift, index) => {
      if (index < 5) {
        console.log(`${freeGiftName[index]}：${gift.free_num}個`);

        // 最小個数を取得
        if (minGiftNum > gift.free_num) {
          minGiftNum = gift.free_num;
        }
      }
    });

    if (minGiftNum === 99) {
      throw new Error("取得する必要がありません");
    }

    let inputGenre = onliveAPI.onlives.find(live => {
      return live.genre_id === 200;
    });

    if (inputGift === 0) {
      console.log("\n開くジャンルを入力してください");
      onliveAPI.onlives.forEach(live => {
        console.info(`【${live.genre_id}】\t${live.genre_name}(${live.lives.length})`);
      });
      inputGenre = await new Promise((resolve, reject) => {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        readline.question('\n入力してください：', (answer) => {
          resolve(onliveAPI.onlives.find(live => {
            return live.genre_id === Number(answer);
          }));
          readline.close();
        });
      });
    }

    console.log(`\n${inputGenre.genre_name}が選択されました\n現在配信中のルームは${inputGenre.lives.length}ルームです\n`);
    console.log(`現在最小個数が${minGiftNum}個なので${(100 - minGiftNum) / 10}ルーム開いて無料ギフトを取得します\n`);

    const openCount = (100 - minGiftNum) / 10;
    const onliveRoom = inputGenre.lives;
    const pollingRoom = [];
    let count = 0;

    for (let room of onliveRoom) {
      if (count >= openCount) {
        break;
      }
      console.log(`${room.room_id}：${room.main_name}にアクセス`);
      config.params.room_id = room.room_id;

      const polling = await client
        .get('/api/live/polling', config)
        .then(result => {
          return result.data;
        });

      if ('live_end' in polling) {
        console.log('配信が終了しています');
        continue;
      }

      if (!polling.is_login) {
        throw new Error('ログインしていません');
      }

      if ('ok' in polling.live_watch_incentive) {
        if (polling.live_watch_incentive.ok === 1) {
          console.log('既にボーナス取得済み');
        }
      } else if ('error' in polling.live_watch_incentive) {
        if (polling.live_watch_incentive.error === 1) {
          console.log(`${polling.toast.message}\n`);
          throw new Error('指定の時間まで取得できません');
        }
      } else {
        pollingRoom.push(room);
        count++;
      }
    }

    console.log('\nPollingアクセス完了\n順次26秒毎に再アクセスしてギフトを取得します\n');
    await new Promise(res => setTimeout(res, interval));

    let errorCount = 0;

    for (let room of pollingRoom) {
      console.log(`${room.room_id}：${room.main_name}に再アクセス`);
      config.params.room_id = room.room_id;

      const polling = await client
        .get('/api/live/polling', config)
        .then(result => {
          return result.data;
        });

      if ('live_end' in polling) {
        console.log('配信終了により取得できず\n');
        errorCount++;
        continue;
      }

      if (!polling.is_login) {
        console.log('ログイン情報連携に失敗したため取得できず\n');
        errorCount++;
        continue;
      }

      if ('ok' in polling.live_watch_incentive) {
        if (polling.live_watch_incentive.ok === 1) {
          console.log(`${polling.toast.message}\n`);
        }
      } else if ('error' in polling.live_watch_incentive) {
        if (polling.live_watch_incentive.error === 1) {
          console.log(`${polling.toast.message}\n`);
          throw new Error('指定の時間まで取得できません');
        }
      } else {
        console.log('何らかの理由により取得できず\n');
        errorCount++;
        continue;
      }
      await new Promise(res => setTimeout(res, interval));
    }

    if (errorCount === 0) {
      console.log('全て正常に処理が終了');
    } else {
      console.log(`${errorCount}ルーム取得に失敗したので再度実行してください`);
    }

  } catch (error) {
    console.log(`\n${error}`);
  }

})();