{
/**
 * 这是应用的主组件文件
 * 它负责组合和布局所有主要的UI卡片, 形成控制面板的整体界面
 */
}
// 从各自的文件中导入所有需要的卡片组件
import { StatusCard } from './components/StatusCard';
import { ConfigCard } from './components/ConfigCard';
import { LogCard } from './components/LogCard';
import { ChatCard } from './components/ChatCard'; // 导入新增的聊天卡片组件

/**
 * App 组件
 * 作为应用的根组件, 渲染整个页面结构
 * @returns {JSX.Element} 返回一个可渲染的React组件
 */
function App() {
  return (
    // --- 整体页面容器 ---
    // 使用 a dark 主题, 设置背景和前景颜色, 保证最小高度占满整个屏幕
    <div className="dark bg-background text-foreground min-h-screen">
      
      {/* --- 页面内容容器 --- */}
      {/* 使用 container 类来设置最大宽度并居中, 同时设置内边距 */}
      <div className="container mx-auto p-4 md:p-8">
        
        {/* --- 页面头部 --- */}
        <header className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
            Gemini Proxy 控制面板
          </h1>
          <p className="text-muted-foreground mt-2">
            您的 OpenAI 兼容 API 服务正在运行
          </p>
        </header>
        
        {/* --- 主内容区域 --- */}
        {/* 使用 a grid 布局来排列卡片 */}
        {/* 在中等屏幕及以上尺寸 (md breakpoint) 使用两列布局 */}
        <main className="grid gap-4 md:grid-cols-2">
          {/* 渲染各个功能卡片 */}
          <StatusCard />
          <ConfigCard />
          <ChatCard /> {/* 在此处添加了新的聊天卡片 */}
          <LogCard />
        </main>

      </div>
    </div>
  )
}

// 导出 App 组件作为模块的默认导出
export default App