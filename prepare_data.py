"""将 Excel 数据预处理为前端可用的 JSON 格式。"""

import json
from pathlib import Path

import pandas as pd

METRICS = [
    "教师推送作业次数",
    "市级题答题数量",
    "校/区级题答题数量",
    "学生答题总数",
]

METRIC_LABELS = {
    "教师推送作业次数": "教师推送作业次数",
    "市级题答题数量": "市级题答题数量",
    "校/区级题答题数量": "校/区级题答题数量",
    "学生答题总数": "学生答题总数",
}


def load_raw(path: str = "data_total.xlsx") -> pd.DataFrame:
    df = pd.read_excel(path)
    df.columns = df.columns.str.strip()
    df["日期"] = pd.to_datetime(df["日期"])
    df["区"] = df["区"].astype(str).str.strip()
    df["学校名称"] = df["学校名称"].astype(str).str.strip()
    return df


def aggregate_school_daily(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby(["日期", "区", "学校名称", "学校编号"], as_index=False)[METRICS]
        .sum()
        .sort_values(["日期", "区", "学校名称"])
    )


def build_meta(df: pd.DataFrame, school_daily: pd.DataFrame) -> dict:
    schools = (
        school_daily[["区", "学校名称", "学校编号"]]
        .drop_duplicates()
        .sort_values(["区", "学校名称"])
    )
    school_list = [
        {
            "district": row["区"],
            "name": row["学校名称"],
            "id": str(int(row["学校编号"])) if pd.notna(row["学校编号"]) else "",
        }
        for _, row in schools.iterrows()
    ]
    districts = sorted(df["区"].dropna().unique().tolist())
    dates = sorted(school_daily["日期"].dt.strftime("%Y-%m-%d").unique().tolist())
    months = sorted({d[:7] for d in dates})

    return {
        "dateMin": dates[0],
        "dateMax": dates[-1],
        "dates": dates,
        "months": months,
        "districts": districts,
        "schools": school_list,
        "metrics": METRICS,
        "metricLabels": METRIC_LABELS,
        "defaultMetric": "学生答题总数",
    }


def records_to_list(school_daily: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in school_daily.iterrows():
        records.append(
            {
                "date": row["日期"].strftime("%Y-%m-%d"),
                "district": row["区"],
                "school": row["学校名称"],
                "schoolId": str(int(row["学校编号"])) if pd.notna(row["学校编号"]) else "",
                **{m: float(row[m]) for m in METRICS},
            }
        )
    return records


def main():
    df = load_raw()
    school_daily = aggregate_school_daily(df)
    payload = {
        "meta": build_meta(df, school_daily),
        "records": records_to_list(school_daily),
    }
    out = Path("static/data/dashboard.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    print(f"已生成 {out}，共 {len(payload['records'])} 条学校日级记录")


if __name__ == "__main__":
    main()
