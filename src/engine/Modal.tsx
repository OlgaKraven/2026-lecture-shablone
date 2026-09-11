import { useEffect,useRef } from 'react'
import type {ReactNode} from 'react'
import {X} from 'lucide-react'
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const origin=document.activeElement as HTMLElement;ref.current?.showModal();return()=>{origin?.focus()}},[])
 return <dialog ref={ref} className="template-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}><div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="Закрыть окно" onClick={onClose}><X size={20}/></button></div>{children}</dialog>
}
