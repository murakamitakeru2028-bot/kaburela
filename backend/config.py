from typing import TypedDict


class StockDef(TypedDict):
    ticker: str
    code: str
    name: str
    label: str


class SectorDef(TypedDict):
    name: str
    color: str
    stocks: list[StockDef]


SECTOR_DEFINITIONS: list[SectorDef] = [
    {
        "name": "電気機器",
        "color": "#3b82f6",
        "stocks": [
            {"ticker": "6758.T", "code": "6758", "name": "ソニーグループ", "label": "ソニーG"},
            {"ticker": "8035.T", "code": "8035", "name": "東京エレクトロン", "label": "東エレク"},
            {"ticker": "6857.T", "code": "6857", "name": "アドバンテスト", "label": "アドバン"},
            {"ticker": "6861.T", "code": "6861", "name": "キーエンス", "label": "キーエンス"},
            {"ticker": "6501.T", "code": "6501", "name": "日立製作所", "label": "日立"},
            {"ticker": "6981.T", "code": "6981", "name": "村田製作所", "label": "村田製"},
        ],
    },
    {
        "name": "輸送用機器",
        "color": "#f97316",
        "stocks": [
            {"ticker": "7203.T", "code": "7203", "name": "トヨタ自動車", "label": "トヨタ"},
            {"ticker": "7267.T", "code": "7267", "name": "ホンダ", "label": "ホンダ"},
            {"ticker": "7201.T", "code": "7201", "name": "日産自動車", "label": "日産"},
            {"ticker": "6902.T", "code": "6902", "name": "デンソー", "label": "デンソー"},
            {"ticker": "7261.T", "code": "7261", "name": "マツダ", "label": "マツダ"},
            {"ticker": "7270.T", "code": "7270", "name": "SUBARU", "label": "SUBARU"},
        ],
    },
    {
        "name": "銀行業",
        "color": "#8b5cf6",
        "stocks": [
            {"ticker": "8306.T", "code": "8306", "name": "三菱UFJフィナンシャル・グループ", "label": "三菱UFJ"},
            {"ticker": "8316.T", "code": "8316", "name": "三井住友フィナンシャルグループ", "label": "三井住友"},
            {"ticker": "8411.T", "code": "8411", "name": "みずほフィナンシャルグループ", "label": "みずほ"},
            {"ticker": "8308.T", "code": "8308", "name": "りそなホールディングス", "label": "りそな"},
            {"ticker": "7182.T", "code": "7182", "name": "ゆうちょ銀行", "label": "ゆうちょ"},
        ],
    },
    {
        "name": "情報・通信業",
        "color": "#14b8a6",
        "stocks": [
            {"ticker": "9432.T", "code": "9432", "name": "NTT", "label": "NTT"},
            {"ticker": "9433.T", "code": "9433", "name": "KDDI", "label": "KDDI"},
            {"ticker": "9984.T", "code": "9984", "name": "ソフトバンクグループ", "label": "SBG"},
            {"ticker": "9434.T", "code": "9434", "name": "ソフトバンク", "label": "SB"},
            {"ticker": "4755.T", "code": "4755", "name": "楽天グループ", "label": "楽天"},
            {"ticker": "4385.T", "code": "4385", "name": "メルカリ", "label": "メルカリ"},
        ],
    },
    {
        "name": "医薬品",
        "color": "#ec4899",
        "stocks": [
            {"ticker": "4502.T", "code": "4502", "name": "武田薬品工業", "label": "武田薬品"},
            {"ticker": "4519.T", "code": "4519", "name": "中外製薬", "label": "中外製薬"},
            {"ticker": "4523.T", "code": "4523", "name": "エーザイ", "label": "エーザイ"},
            {"ticker": "4568.T", "code": "4568", "name": "第一三共", "label": "第一三共"},
            {"ticker": "4507.T", "code": "4507", "name": "塩野義製薬", "label": "塩野義"},
        ],
    },
    {
        "name": "食料品",
        "color": "#84cc16",
        "stocks": [
            {"ticker": "2802.T", "code": "2802", "name": "味の素", "label": "味の素"},
            {"ticker": "2503.T", "code": "2503", "name": "キリンホールディングス", "label": "キリン"},
            {"ticker": "2914.T", "code": "2914", "name": "日本たばこ産業", "label": "JT"},
            {"ticker": "2269.T", "code": "2269", "name": "明治ホールディングス", "label": "明治"},
            {"ticker": "2502.T", "code": "2502", "name": "アサヒグループホールディングス", "label": "アサヒ"},
        ],
    },
    {
        "name": "化学",
        "color": "#06b6d4",
        "stocks": [
            {"ticker": "4063.T", "code": "4063", "name": "信越化学工業", "label": "信越化学"},
            {"ticker": "4452.T", "code": "4452", "name": "花王", "label": "花王"},
            {"ticker": "4188.T", "code": "4188", "name": "三菱ケミカルグループ", "label": "三菱ケミ"},
            {"ticker": "4183.T", "code": "4183", "name": "三井化学", "label": "三井化学"},
            {"ticker": "3402.T", "code": "3402", "name": "東レ", "label": "東レ"},
        ],
    },
    {
        "name": "機械",
        "color": "#f59e0b",
        "stocks": [
            {"ticker": "6301.T", "code": "6301", "name": "コマツ", "label": "コマツ"},
            {"ticker": "6326.T", "code": "6326", "name": "クボタ", "label": "クボタ"},
            {"ticker": "6367.T", "code": "6367", "name": "ダイキン工業", "label": "ダイキン"},
            {"ticker": "6954.T", "code": "6954", "name": "ファナック", "label": "ファナック"},
            {"ticker": "7013.T", "code": "7013", "name": "IHI", "label": "IHI"},
        ],
    },
    {
        "name": "小売業",
        "color": "#10b981",
        "stocks": [
            {"ticker": "3382.T", "code": "3382", "name": "セブン&アイ・ホールディングス", "label": "7&i"},
            {"ticker": "8267.T", "code": "8267", "name": "イオン", "label": "イオン"},
            {"ticker": "9843.T", "code": "9843", "name": "ニトリホールディングス", "label": "ニトリ"},
            {"ticker": "9983.T", "code": "9983", "name": "ファーストリテイリング", "label": "ユニクロ"},
            {"ticker": "3048.T", "code": "3048", "name": "ビックカメラ", "label": "ビックカメラ"},
        ],
    },
    {
        "name": "不動産業",
        "color": "#f43f5e",
        "stocks": [
            {"ticker": "8801.T", "code": "8801", "name": "三井不動産", "label": "三井不動産"},
            {"ticker": "8802.T", "code": "8802", "name": "三菱地所", "label": "三菱地所"},
            {"ticker": "8830.T", "code": "8830", "name": "住友不動産", "label": "住友不動産"},
            {"ticker": "8804.T", "code": "8804", "name": "東京建物", "label": "東京建物"},
            {"ticker": "3231.T", "code": "3231", "name": "野村不動産ホールディングス", "label": "野村不動産"},
        ],
    },
    {
        "name": "電気・ガス業",
        "color": "#64748b",
        "stocks": [
            {"ticker": "9501.T", "code": "9501", "name": "東京電力ホールディングス", "label": "東電HD"},
            {"ticker": "9502.T", "code": "9502", "name": "中部電力", "label": "中部電力"},
            {"ticker": "9503.T", "code": "9503", "name": "関西電力", "label": "関西電力"},
            {"ticker": "9531.T", "code": "9531", "name": "東京ガス", "label": "東京ガス"},
            {"ticker": "9532.T", "code": "9532", "name": "大阪ガス", "label": "大阪ガス"},
        ],
    },
    {
        "name": "建設業",
        "color": "#9333ea",
        "stocks": [
            {"ticker": "1801.T", "code": "1801", "name": "大成建設", "label": "大成建設"},
            {"ticker": "1802.T", "code": "1802", "name": "大林組", "label": "大林組"},
            {"ticker": "1803.T", "code": "1803", "name": "清水建設", "label": "清水建設"},
            {"ticker": "1812.T", "code": "1812", "name": "鹿島建設", "label": "鹿島"},
            {"ticker": "1925.T", "code": "1925", "name": "大和ハウス工業", "label": "大和ハウス"},
            {"ticker": "1928.T", "code": "1928", "name": "積水ハウス", "label": "積水ハウス"},
        ],
    },
]

VALID_PERIODS = {"1M", "3M", "6M", "1Y", "3Y", "5Y"}

ALL_STOCKS: list[StockDef] = [
    stock for sector in SECTOR_DEFINITIONS for stock in sector["stocks"]
]


class MacroIndicatorDef(TypedDict):
    ticker: str
    code: str
    name: str
    label: str
    color: str


MACRO_INDICATORS: list[MacroIndicatorDef] = [
    {"ticker": "USDJPY=X", "code": "USDJPY", "name": "ドル円", "label": "USD/JPY", "color": "#f59e0b"},
    {"ticker": "EURJPY=X", "code": "EURJPY", "name": "ユーロ円", "label": "EUR/JPY", "color": "#06b6d4"},
    {"ticker": "^N225", "code": "N225", "name": "日経平均", "label": "日経平均", "color": "#ef4444"},
    {"ticker": "^GSPC", "code": "GSPC", "name": "S&P500", "label": "S&P500", "color": "#3b82f6"},
    {"ticker": "GC=F", "code": "GOLD", "name": "金", "label": "金(XAU)", "color": "#eab308"},
    {"ticker": "CL=F", "code": "OIL", "name": "WTI原油", "label": "WTI原油", "color": "#8b5cf6"},
]
