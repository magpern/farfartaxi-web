import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { TabBar } from './TabBar'
import { tabBarHidden } from './tabs'

const labels = () => screen.getAllByRole('link').map((a) => a.textContent)

describe('TabBar', () => {
  it('passengers get Boka · Mina resor · Platser · Mer', () => {
    renderApp(<TabBar role="USER" />)
    expect(labels()).toEqual(['Boka', 'Mina resor', 'Platser', 'Mer'])
  })
  it('drivers and admins get Förfrågningar · Boka · Mer', () => {
    renderApp(<TabBar role="DRIVER" />)
    expect(labels()).toEqual(['Förfrågningar', 'Boka', 'Mer'])
  })
  it('admins (who drive) get the driver tabs; Boka goes to /app/boka', () => {
    renderApp(<TabBar role="ADMIN" />)
    expect(labels()).toEqual(['Förfrågningar', 'Boka', 'Mer'])
    expect(screen.getByRole('link', { name: 'Boka' })).toHaveAttribute('href', '/app/boka')
  })
  it('marks the current tab and hides itself in driving mode', () => {
    renderApp(<TabBar role="USER" />, { path: '/app/resa/5' })
    expect(screen.getByRole('link', { name: 'Boka' })).toHaveAttribute('aria-current', 'page')
    expect(tabBarHidden('/app/forare/kor/3')).toBe(true)
    expect(tabBarHidden('/app/resor')).toBe(false)
  })
  it('hides itself on the driving screen', () => {
    renderApp(<TabBar role="DRIVER" />, { path: '/app/forare/kor/3' })
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
