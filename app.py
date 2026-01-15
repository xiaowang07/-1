import streamlit as st
import pandas as pd
import plotly.express as px

# 页面配置
st.set_page_config(page_title="上海教育软件使用看板", layout="wide")

# 1. 数据预处理
@st.cache_data # 缓存功能，避免每次点击都重新读取文件
def load_data():
    # 这里修改你的文件名
    df = pd.read_excel("data_total.xlsx") 
    df['日期'] = pd.to_datetime(df['日期'])
    # 添加学年字段 (上海一般9月开学)
    df['学年'] = df['日期'].apply(lambda x: f"{x.year}-{x.year+1}" if x.month >= 9 else f"{x.year-1}-{x.year}")
    df['月份'] = df['日期'].dt.to_period('M').astype(str)
    return df

try:
    df = load_data()
except Exception as e:
    st.error(f"数据加载失败，请检查文件名是否为 'data_total.xlsx' 且路径正确。错误原因: {e}")
    st.stop()

# 定义板块对应关系 (在这里修改项目名称)
COLS_A = ['a', 'b', 'c', 'd', 'e']
COLS_B = ['f', 'g', 'h', 'i']
ALL_ITEMS = COLS_A + COLS_B

# --- 侧边栏筛选器 ---
st.sidebar.header("全局筛选")
time_unit = st.sidebar.radio("查看维度", ["按月", "按学年"])
date_range = st.sidebar.date_input("选择日期范围", [df['日期'].min(), df['日期'].max()])

# --- 主界面 ---
st.title("📊 教育软件使用情况看板")

tabs = st.tabs(["区域总体概览", "区内学校对比", "指定学校对比", "单校详细分析"])

# --- Tab 1: 区域总体概览 ---
with tabs[0]:
    st.subheader("16区整体使用趋势")
    # 数据聚合
    group_col = '月份' if time_unit == "按月" else '学年'
    trend_data = df.groupby(group_col)[['板块A', '板块B']].sum().reset_index()
    
    fig1 = px.line(trend_data, x=group_col, y=['板块A', '板块B'], markers=True, title="整体增长趋势")
    st.plotly_chart(fig1, use_container_width=True)
    
    st.dataframe(trend_data) # 显示数据表

# --- Tab 2: 区内学校对比 ---
with tabs[1]:
    selected_district = st.selectbox("选择区域", df['区名称'].unique())
    district_df = df[df['区名称'] == selected_district]
    
    schools = st.multiselect("选择学校进行对比 (最多10个)", district_df['学校名称'].unique(), max_selections=10)
    
    if schools:
        school_trend = district_df[district_df['学校名称'].isin(schools)].groupby(['月份', '学校名称'])['板块A'].sum().reset_index()
        fig2 = px.line(school_trend, x='月份', y='板块A', color='学校名称', title=f"{selected_district}各校板块A使用对比")
        st.plotly_chart(fig2, use_container_width=True)

# --- Tab 3: 指定学校对比 ---
with tabs[2]:
    comp_schools = st.multiselect("跨区选择学校 (最多20个)", df['学校名称'].unique(), max_selections=20)
    target_col = st.selectbox("对比维度", ["板块A", "板块B"] + ALL_ITEMS)
    
    if comp_schools:
        comp_df = df[df['学校名称'].isin(comp_schools)].groupby(['月份', '学校名称'])[target_col].sum().reset_index()
        fig3 = px.bar(comp_df, x='月份', y=target_col, color='学校名称', barmode='group')
        st.plotly_chart(fig3, use_container_width=True)

# --- Tab 4: 单校详细分析 ---
with tabs[3]:
    target_school = st.selectbox("选择目标学校", df['学校名称'].unique(), key="single_school")
    school_detail = df[df['学校名称'] == target_school]
    
    # 教师对比
    teachers = st.multiselect("选择教师对比", school_detail['教师姓名'].unique())
    if teachers:
        teacher_df = school_detail[school_detail['教师姓名'].isin(teachers)].groupby(['月份', '教师姓名'])['板块A'].sum().reset_index()
        st.plotly_chart(px.line(teacher_df, x='月份', y='板块A', color='教师姓名'))
    
    # 板块细分项目
    st.markdown("### 细分项目分布")
    item_sum = school_detail[ALL_ITEMS].sum().reset_index()
    item_sum.columns = ['项目', '使用量']
    st.plotly_chart(px.pie(item_sum, values='使用量', names='项目'))