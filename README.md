# SceneryNews — 日常の風景からニュースに出会う

[![Deploy to GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-222?logo=github)](https://pages.github.com/)
[![Model](https://img.shields.io/badge/Model-Gemini%204%20Hydrogen-D95D39)](https://aistudio.google.com/)

論文 **"Making News Familiar: News Recommendation from Daily Scenery"** (KES 2025, *Procedia Computer Science* 270, pp. 534–543, DOI: [`10.1016/j.procs.2025.09.172`](https://doi.org/10.1016/j.procs.2025.09.172)) を、**Gemini 4 Hydrogen (`gemini-4-hydrogen`)** と **Google 検索グラウンディング** で実装したモバイルファーストのカメラ Web アプリです。

ビルド不要の静的サイト（HTML / CSS / ES Modules）で構成されており、**GitHub Pages に push するだけで即座に HTTPS 公開**でき、iPhone / Android のブラウザから背面カメラを使ってそのまま動かせます。

---

## 主な特徴（論文からの進化ポイント）

| ステップ | 論文の初期実装 (2024) | 本実装 (`gemini-4-hydrogen`) |
| :--- | :--- | :--- |
| **1. 画像入力** | Streamlit 画像アップロード + EdgeSAM 領域抽出 | スマホ背面カメラ (`getUserMedia`)・アルバム選択・D&D・貼り付け・**写真上の任意箇所タップによる領域フォーカス**・サンプル風景3種 |
| **2. 物体検出** | Gemini 1.0 Pro Vision（名前リストのみ） | **`gemini-4-hydrogen` (`thinkingLevel: "low"`)** で最大6個のモノを `box_2d` 座標・固有名詞・**意味曖昧性解消コンテキスト**付きで検出（Google Lens 風のピン表示） |
| **3. ニュース推薦** | Elasticsearch による日経記事キーワード検索 | **`gemini-4-hydrogen` + Google 検索グラウンディング (`google_search`)** でリアルタイムに主題一致・セレンディピティ重視のニュースを最大5件推薦（実在URLのみ付与） |
| **4. 課題対応 (§5.5)** | 同音異義語（照明ランプ↔道路ランプ）・暗い話題の混入 | 検出時の文脈タグで同音異義語を解消 + **発見重視モード（ドゥームスクロール対策）** トグルを搭載 |
| **5. 評価・記録 (§5.2)** | 実験シートで手動集計 | 各記事に **関連性 / 新規性 / 意外性** の3軸評価ボタンと **Serendipity 率ダッシュボード**（論文平均 12% と比較可能）・スクラップ帳・JSON エクスポート機能を搭載 |

---

## かんたんデプロイ（GitHub Pages）

このリポジトリは **ビルドステップ不要** です。

1. 新しい GitHub リポジトリを作成して push します：
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. GitHub リポジトリの **Settings → Pages → Build and deployment** で **Source: GitHub Actions**（または **Deploy from a branch: `main` / `(root)`**）を選択します。
3. 発行された `https://<your-username>.github.io/<your-repo>/` をスマホで開きます（HTTPS のためカメラ API がそのまま動作します）。
4. 初回起動時に設定画面が開くので、[Google AI Studio](https://aistudio.google.com/apikey) で取得した **Gemini API キー** を入力します（キーは端末の `localStorage` にのみ保存され、リポジトリには含まれません）。

---

## ローカルで試す

```bash
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く（localhost はカメラ API が許可されます）
```

---

## ディレクトリ構成

```text
.
├── index.html                        # アプリシェル・カメラ/結果/モーダルUI
├── styles.css                        # モバイルファースト + デスクトップ分割レイアウト
├── manifest.json                     # PWA マニフェスト（ホーム画面追加対応）
├── icons/icon.svg                    # アプリアイコン
├── src/
│   ├── main.js                       # 画面状態・Lensピン・ニュースカード・評価UI
│   ├── gemini.js                     # Gemini 4 Hydrogen REST API + Google Search Grounding
│   ├── camera.js                     # カメラ制御・WYSIWYGキャプチャ・切り抜きサムネイル
│   ├── samples.js                    # すぐ試せるサンプル風景（デスク/鍋キッチン/ベッドルーム）
│   └── storage.js                    # APIキー・設定・スクラップ帳・セレンディピティ評価保存
└── .github/workflows/deploy-pages.yml # GitHub Pages 自動デプロイ
```

---

## 参考文献

```bibtex
@article{tanabe2025making,
  title={Making News Familiar: News Recommendation from Daily Scenery},
  author={Tanabe, Kota and Ishihara, Shotaro and Yamada, Kenta and Aota, Masaki and Matayoshi, Yasutsuna},
  journal={Procedia Computer Science},
  volume={270},
  pages={534--543},
  year={2025},
  publisher={Elsevier},
  doi={10.1016/j.procs.2025.09.172}
}
```
