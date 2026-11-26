import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import '../styles/command.css';
import '../styles/public-experience.css';
import '../styles/avatar-studio-v3.css';
import '../styles/meeting.css';
import '../styles/live-presence-v4.css';
import '../styles/echo-world-v5.css';
export default function App({ Component, pageProps }: AppProps) {
  return <>
    <Head>
      <title>ECHO — Your presence. Beyond boundaries.</title>
      <meta name="description" content="A personal intelligence layer for human presence, connection and digital identity." />
      <meta name="theme-color" content="#050507" />
      <link rel="icon" href="/echo-mark.svg" type="image/svg+xml" />
    </Head>
    <Component {...pageProps} />
  </>;
}
