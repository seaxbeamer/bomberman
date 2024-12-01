import './App.css';
import React, { useEffect } from 'react';
import GameCanvas from './GameCanvas';

function App() {
  useEffect(() => {
    // Проверяем, что Telegram WebApp SDK доступен
    if (window.Telegram) {
      const webApp = window.Telegram.WebApp;

      // Инициализация WebApp
      webApp.ready(); // Сообщаем Telegram, что приложение готово
      webApp.expand(); // Раскрываем приложение на весь экран

      console.log('Telegram Web App initialized:', webApp);

      // Выводим имя пользователя (если доступно)
      if (webApp.initDataUnsafe && webApp.initDataUnsafe.user) {
        const user = webApp.initDataUnsafe.user;
        console.log(`Hello, ${user.first_name}!`);
      }
    } else {
      console.error('Telegram WebApp SDK not loaded.');
    }
  }, []);

  return (
    <div className="App">
      <main className="Game-area">
        <GameCanvas />
      </main>
    </div>
  );
}

export default App;
