'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/' && pathname?.startsWith(href))

  return (
    <Link
      href={href}
      className={`
        block px-3 py-2 rounded text-[13px] font-medium transition-colors
        ${isActive
          ? 'bg-[#3A3A38] text-white border-l-2 border-[#EF9F27] -ml-[2px]'
          : 'text-gray-400 hover:bg-[#3A3A38] hover:text-white'
        }
      `}
    >
      {label}
    </Link>
  )
}

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[200px] bg-[#2C2C2A] flex flex-col">
      {/* Navigation sections */}
      <nav className="flex-1 pt-8 px-3">
        {/* Research section */}
        <div className="mb-8">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3">
            Research
          </div>
          <div className="space-y-1">
            <NavLink href="/" label="Dashboard" />
            <NavLink href="/people" label="People" />
            <NavLink href="/mysteries" label="Mysteries" />
          </div>
        </div>

        {/* Data section */}
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3">
            Data
          </div>
          <div className="space-y-1">
            <NavLink href="/documents" label="Documents" />
            <NavLink href="/dna" label="DNA" />
            <NavLink href="/map" label="Map" />
          </div>
        </div>
      </nav>

      {/* Hermes active indicator */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2 text-[13px] text-gray-400">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>Hermes active</span>
        </div>
      </div>
    </aside>
  )
}
