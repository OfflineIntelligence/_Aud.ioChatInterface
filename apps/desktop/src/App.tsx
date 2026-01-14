// Root layout: sidebar + chat window with full-viewport container
import { ChatWindow } from './components/ChatWindow'
import { Sidebar } from './components/Sidebar'
import './App.css'

function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <ChatWindow />
    </div>
  )
}

export default App
