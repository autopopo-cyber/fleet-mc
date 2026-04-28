import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { locales, defaultLocale, type Locale } from './config'

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale

  // 1. Check NEXT_LOCALE cookie (用户手动选择)
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined
  if (cookieLocale && locales.includes(cookieLocale)) {
    locale = cookieLocale
  }
  // 否则保持默认 zh（不再追随浏览器 Accept-Language）

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
