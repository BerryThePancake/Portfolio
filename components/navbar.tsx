'use client'

import React from 'react'
import NextLink from 'next/link'
import { Link } from '@heroui/link'
import { Input } from '@heroui/input'
import {
  Navbar as HeroUINavbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
} from '@heroui/navbar'
import { ThemeSwitch } from '@/components/theme-switch'

// Inline SVG mask that renders /public/cowboy-hat-logo.jpg as a silhouette
const HatLogo = ({ className = 'h-8 w-10 text-slate-100' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <filter id="invert">
        <feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" />
      </filter>
      <mask id="hatMask">
        <image href="/cowboy-hat-logo.jpg" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" filter="url(#invert)" />
      </mask>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="currentColor" mask="url(#hatMask)" />
  </svg>
)

// Nav items
const items = [
  { href: '/', label: 'Home' },
  { href: '/projects', label: 'Projects' },
  { href: '/itw', label: 'ITW' },
  { href: '/resume', label: 'Résumé' },
  { href: '/contact-me', label: 'Contact' },
]

export const Navbar = () => {
  const searchInput = (
    <Input
      aria-label="Search"
      placeholder="Search..."
      size="sm"
      classNames={{
        inputWrapper:
          'bg-slate-800/60 border border-slate-700 focus-within:border-slate-500',
        input: 'text-sm',
      }}
      type="search"
    />
  )

  return (
    <HeroUINavbar maxWidth="xl" position="sticky" className="bg-transparent">
      {/* Left: logo + name pill */}
      <NavbarContent justify="start" className="gap-3">
        <NavbarBrand as="div" className="gap-3 md:gap-4 max-w-fit items-center">
          {/* Cowboy hat now acts as a button-like link to Home */}
          <NextLink
            href="/"
            aria-label="Go to home"
            title="Home"
            className="inline-flex items-center justify-center -m-1 p-1 cursor-pointer transition hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500/40 rounded-full"
          >
            <HatLogo className="h-10 w-12 md:h-12 md:w-14 text-slate-100" />
            <span className="sr-only">Home</span>
          </NextLink>

          {/* Name pill still links to Contact page */}
          <NextLink
            className="px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700 hover:border-slate-500 transition font-semibold tracking-wide"
            href="/contact-me"
            aria-label="Contact Austin"
          >
            Austin Riha
          </NextLink>
        </NavbarBrand>
      </NavbarContent>

      {/* Center: nav links */}
      <NavbarContent justify="center" className="hidden md:flex gap-6">
        {items.map((i) => (
          <NavbarItem key={i.href}>
            {i.href.endsWith('.pdf') ? (
              <Link href={i.href} target="_blank" isExternal rel="noopener">{i.label}</Link>
            ) : (
              <Link as={NextLink} href={i.href}>{i.label}</Link>
            )}
          </NavbarItem>
        ))}
      </NavbarContent>

      {/* Right: search + theme + mobile toggle */}
      <NavbarContent justify="end" className="items-center gap-2">
        <div className="hidden sm:block">{searchInput}</div>
        <ThemeSwitch />
        <NavbarMenuToggle className="md:hidden" aria-label="Open menu" />
      </NavbarContent>

      {/* Mobile menu */}
      <NavbarMenu>
        <div className="px-2 py-3">{searchInput}</div>
        {items.map((i) => (
          <NavbarMenuItem key={`m-${i.href}`}>
            {i.href.endsWith('.pdf') ? (
              <Link href={i.href} target="_blank" isExternal rel="noopener" className="w-full">{i.label}</Link>
            ) : (
              <Link as={NextLink} href={i.href} className="w-full">{i.label}</Link>
            )}
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </HeroUINavbar>
  )
}
