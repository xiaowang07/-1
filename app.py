import streamlit as st
import pandas as pd
import plotly.express as px

st.set_page_config(page_title="上海教育软件使用看板", layout="wide")

# -------------------
# 加载与预处理
# -------------------
@st.cache_data
def load_data(path="data_total.xlsx"):
    df = pd.read_excel(path)
    # 清理列名空格
    df.columns = df.columns.str.strip()
    if '日期' not in df.columns:
        raise KeyError("缺少必要列: '日期'")
    df['日期'] = pd.to_datetime(df['日期'])
    # 计算学年（9月及以后算当年-次年，否则算上一年-当年）
    df['学年'] = df['日期'].apply(
        lambda x: f"{x.year}-{x.year+1}" if x.month >= 9 else f"{x.year-1}-{x.year}"
    )
    df['月份'] = df['日期'].dt.to_period('M').astype(str)
    return df

try:
    df = load_data()
except Exception as e:
    st.error(f"数据加载失败，请检查 data_total.xlsx 是否存在且含有 '日期' 列。错误: {e}")
    st.stop()

# 常用列名检查与自动发现可用于“细分项目”的列
REQUIRED_COLS = ['日期', '区名称', '学校名称', '教师姓名', '板块A', '板块B']
missing = [c for c in REQUIRED_COLS if c not in df.columns]
if missing:
    st.warning(f"数据表中缺少下列推荐列（部分功能可能受限）：{missing}")

# 尝试识别“细分项目”列（ALL_ITEMS）
# 优先使用明显的板块子项列（例如以 '板块A_' 或 '板块B_' 前缀的列），否则使用数值型且不在已知列列表中的列
known = set(['日期', '学年', '月份', '区名称', '学校名称', '教师姓名', '板块A', '板块B'])
prefixed = [c for c in df.columns if c.startswith('板块A') or c.startswith('板块B')]
if prefixed:
    ALL_ITEMS = prefixed
else:
    numeric_cols = [c for c in df.select_dtypes(include='number').columns if c not in known]
    ALL_ITEMS = numeric_cols

# -------------------
# 侧边栏筛选（全局）
# -------------------
st.sidebar.header("全局筛选")
time_unit = st.sidebar.radio("查看维度", ["按月", "按学年"])

# 日期范围选择（默认最小到最大）
min_date = df['日期'].min().date()
max_date = df['日期'].max().date()
date_range = st.sidebar.date_input("选择日期范围", value=[min_date, max_date])
# 确保返回一个长度为2的范围
if isinstance(date_range, tuple) or isinstance(date_range, list):
    if len(date_range) == 2:
        start_date = pd.to_datetime(date_range[0])
        end_date = pd.to_datetime(date_range[1])
    else:
        start_date = pd.to_datetime(date_range[0])
        end_date = pd.to_datetime(date_range[0])
else:
    start_date = pd.to_datetime(date_range)
    end_date = pd.to_datetime(date_range)

# 区与学校选择（全局）
districts = sorted(df['区名称'].dropna().unique().tolist()) if '区名称' in df.columns else []
district_options = ['全部区域'] + districts
selected_district = st.sidebar.selectbox("选择区（全局）", district_options)

# 根据区筛选可选学校列表
if '学校名称' in df.columns:
    if selected_district != '全部区域':
        school_choices = sorted(df[df['区名称'] == selected_district]['学校名称'].dropna().unique().tolist())
    else:
        school_choices = sorted(df['学校名称'].dropna().unique().tolist())
else:
    school_choices = []

selected_schools = st.sidebar.multiselect("选择学校（全局，多选，留空表示全部）", school_choices)

# -------------------
# 根据侧边栏筛选数据（后续所有 tab 共用 filtered_df）
# -------------------
filtered_df = df[(df['日期'] >= start_date) & (df['日期'] <= end_date)]
if selected_district != '全部区域':
    filtered_df = filtered_df[filtered_df['区名称'] == selected_district]
if selected_schools:
    filtered_df = filtered_df[filtered_df['学校名称'].isin(selected_schools)]

if filtered_df.empty:
    st.warning("筛选后没有数据。请调整日期/区/学校筛选条件。")

# -------------------
# 页面主体：Tabs
# -------------------
st.title("📊 教育软件使用情况看板（修订版）")
tabs = st.tabs(["区域总体概览", "区内学校对比", "指定学校对比", "单校详细分析"])

# --- Tab 1: 区域总体概览 ---
with tabs[0]:
    st.subheader("整体使用趋势")
    group_col = '月份' if time_unit == "按月" else '学年'
    sum_cols = [c for c in ['板块A', '板块B'] if c in filtered_df.columns]
    if not sum_cols:
        st.info("数据中缺少 '板块A' 和 '板块B' 列，无法绘制总体趋势。")
    else:
        trend_data = filtered_df.groupby(group_col)[sum_cols].sum().reset_index()

        # 为了正确排序，当按月份时以时间顺序排序；当按学年时按学年起始年份排序
        if group_col == '月份':
            # 生成真实日期以排序（每月第一天）
            trend_data['月份_dt'] = pd.to_datetime(trend_data['月份'] + '-01')
            trend_data = trend_data.sort_values('月份_dt')
            order = trend_data['月份'].tolist()
            fig1 = px.line(trend_data, x='月份', y=sum_cols, markers=True, title="整体增长趋势",
                           category_orders={'月份': order})
            fig1.update_xaxes(title="月份")
        else:
            # 学年排序（取学年起始年）
            trend_data['学年_start'] = trend_data['学年'].str.split('-').str[0].astype(int)
            trend_data = trend_data.sort_values('学年_start')
            order = trend_data['学年'].tolist()
            fig1 = px.line(trend_data, x='学年', y=sum_cols, markers=True, title="整体增长趋势",
                           category_orders={'学年': order})
            fig1.update_xaxes(title="学年")

        # 显示悬停数值与 marker
        fig1.update_traces(mode='lines+markers', hovertemplate='%{y:.2f}<extra>%{fullData.name}</extra>')
        fig1.update_layout(legend_title_text="指标")
        st.plotly_chart(fig1, use_container_width=True)
        st.dataframe(trend_data.drop(columns=[c for c in ['月份_dt', '学年_start'] if c in trend_data.columns]))

# --- Tab 2: 区内学校对比 ---
with tabs[1]:
    st.subheader("区内学校对比（使用侧边栏的区/学校筛选）")
    if '学校名称' not in filtered_df.columns:
        st.info("没有 '学校名称' 列，无法展示区内学校对比。")
    else:
        # 如果侧边栏未选学校，给出区域内学校选择（最多10个）
        local_district = selected_district if selected_district != '全部区域' else None
        if local_district:
            district_df = df[df['区名称'] == local_district]
        else:
            district_df = df.copy()

        local_schools = st.multiselect("选择学校进行对比（最多10个）", sorted(district_df['学校名称'].dropna().unique()), key="tab2_schools")
        if local_schools:
            if len(local_schools) > 10:
                st.warning("最多只能对比 10 所学校，已取前 10 个")
                local_schools = local_schools[:10]
            comp_df = filtered_df[filtered_df['学校名称'].isin(local_schools)]
            if comp_df.empty:
                st.info("筛选后无数据。")
            else:
                # 聚合板块A（若不存在则尝试板块B）
                compare_col = '板块A' if '板块A' in comp_df.columns else ('板块B' if '板块B' in comp_df.columns else None)
                if compare_col is None:
                    st.info("数据中既没有 '板块A' 也没有 '板块B'，无法绘图。")
                else:
                    school_trend = comp_df.groupby(['月份', '学校名称'])[compare_col].sum().reset_index()
                    # 保证月份按时间排序
                    school_trend['月份_dt'] = pd.to_datetime(school_trend['月份'] + '-01')
                    school_trend = school_trend.sort_values('月份_dt')
                    fig2 = px.line(school_trend, x='月份', y=compare_col, color='学校名称', markers=True,
                                   title=f"{local_district or '所选区域'} 各校 {compare_col} 使用对比")
                    fig2.update_traces(mode='lines+markers', hovertemplate='%{y:.2f}<extra>%{fullData.name}</extra>')
                    fig2.update_xaxes(title="月份")
                    st.plotly_chart(fig2, use_container_width=True)

# --- Tab 3: 指定学校对比（跨区） ---
with tabs[2]:
    st.subheader("跨区学校对比")
    all_schools = sorted(df['学校名称'].dropna().unique()) if '学校名称' in df.columns else []
    comp_schools = st.multiselect("跨区选择学校（最多20个）", all_schools, key="tab3_schools")
    target_col = st.selectbox("对比维度", options=[c for c in (['板块A', '板块B'] + ALL_ITEMS) if c in df.columns])
    if comp_schools:
        if len(comp_schools) > 20:
            st.warning("最多只能对比 20 所学校，已取前 20 个")
            comp_schools = comp_schools[:20]
        comp_df = filtered_df[filtered_df['学校名称'].isin(comp_schools)]
        if comp_df.empty:
            st.info("筛选后无数据。")
        else:
            comp_agg = comp_df.groupby(['月份', '学校名称'])[target_col].sum().reset_index()
            comp_agg['月份_dt'] = pd.to_datetime(comp_agg['月份'] + '-01')
            comp_agg = comp_agg.sort_values('月份_dt')
            fig3 = px.bar(comp_agg, x='月份', y=target_col, color='学校名称', barmode='group',
                          title=f"{target_col} 跨校对比")
            fig3.update_traces(hovertemplate='%{y:.2f}<extra>%{fullData.name}</extra>')
            fig3.update_xaxes(title="月份")
            st.plotly_chart(fig3, use_container_width=True)

# --- Tab 4: 单校详细分析（教师对比板块A） ---
with tabs[3]:
    st.subheader("单校详细分析 — 教师板块A对比")
    if '学校名称' not in filtered_df.columns:
        st.info("没有 '学校名称' 列，无法进行单校分析。")
    else:
        target_school = st.selectbox("选择目标学校（受侧边栏筛选影响）",
                                     options=sorted(filtered_df['学校名称'].dropna().unique()),
                                     key="single_school")
        school_detail = filtered_df[filtered_df['学校名称'] == target_school]
        if school_detail.empty:
            st.info("所选学校在当前筛选条件下无数据。")
        else:
            # 教师对比（板块A）
            if '教师姓名' not in school_detail.columns:
                st.info("数据中缺少 '教师姓名' 列，无法按教师对比。")
            else:
                teachers = st.multiselect("选择教师进行对比（最多10个）", sorted(school_detail['教师姓名'].dropna().unique()), key="tab4_teachers")
                if teachers:
                    if len(teachers) > 10:
                        st.warning("最多可选择 10 位教师，已取前 10 位")
                        teachers = teachers[:10]
                    tdf = school_detail[school_detail['教师姓名'].isin(teachers)]
                    if '板块A' not in tdf.columns:
                        st.info("没有 '板块A' 列，无法比较教师使用量。")
                    else:
                        teacher_df = tdf.groupby(['月份', '教师姓名'])['板块A'].sum().reset_index()
                        teacher_df['月份_dt'] = pd.to_datetime(teacher_df['月份'] + '-01')
                        teacher_df = teacher_df.sort_values('月份_dt')
                        fig4 = px.line(teacher_df, x='月份', y='板块A', color='教师姓名', markers=True,
                                       title=f"{target_school} 教师板块A使用量对比")
                        fig4.update_traces(mode='lines+markers', hovertemplate='%{y:.2f}<extra>%{fullData.name}</extra>')
                        fig4.update_xaxes(title="月份")
                        st.plotly_chart(fig4, use_container_width=True)

            # 板块细分项目饼图（如果有可用的 ALL_ITEMS）
            if ALL_ITEMS:
                st.markdown("### 细分项目分布（所选学校）")
                # 取学校内所有月份的总和作为分布
                item_sum = school_detail[ALL_ITEMS].sum(numeric_only=True).reset_index()
                item_sum.columns = ['项目', '使用量']
                item_sum = item_sum[item_sum['使用量'] > 0]
                if item_sum.empty:
                    st.info("暂无细分项目数据可视化。")
                else:
                    fig_pie = px.pie(item_sum, values='使用量', names='项目', title="细分项目分布")
                    fig_pie.update_traces(textposition='inside', hovertemplate='%{label}: %{value:.2f}<extra></extra>')
                    st.plotly_chart(fig_pie, use_container_width=True)
            else:
                st.info("未识别到细分项目列，无法生成项目分布图。")
