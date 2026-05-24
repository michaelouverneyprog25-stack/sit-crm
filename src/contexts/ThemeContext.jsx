import React, { createContext, useContext, useEffect, useState } from 'react'
const ThemeContext = createContext()
export function useTheme(){return useContext(ThemeContext)}
export function ThemeProvider({children}){
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('sit.theme') !== 'light'
  })
  useEffect(()=>{
    if(dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    window.localStorage.setItem('sit.theme', dark ? 'dark' : 'light')
  },[dark])
  return (
    <ThemeContext.Provider value={{dark,setDark}}>{children}</ThemeContext.Provider>
  )
}
