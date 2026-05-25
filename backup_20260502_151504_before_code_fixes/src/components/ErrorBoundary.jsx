import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main id="main-content" className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
          <div role="alert" aria-live="assertive" className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
            <div className="text-5xl" aria-hidden="true">⚠️</div>
            <h1 className="text-xl font-bold text-gray-800">אירעה שגיאה</h1>
            <p className="text-gray-500 text-sm">
              {this.state.error?.message || 'שגיאה לא ידועה'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition"
            >
              טען מחדש
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
