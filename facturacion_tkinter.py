import tkinter as tk
from tkinter import ttk, messagebox
import pandas as pd
from datetime import datetime

class FacturacionApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Sistema de Facturación - Caja Diaria")
        self.root.geometry("500x600")
        self.root.resizable(False, False)
        
        # Variables
        self.entries = {}
        
        # Crear interfaz
        self.create_widgets()
        
    def create_widgets(self):
        # Título
        title_label = tk.Label(self.root, text="SISTEMA DE FACTURACIÓN", 
                              font=("Arial", 18, "bold"), fg="blue")
        title_label.pack(pady=10)
        
        # Frame para inputs
        frame = ttk.Frame(self.root, padding="20")
        frame.pack(fill=tk.BOTH, expand=True)
        
        # Campos
        campos = [
            ("Recaudado:", "recaudado"),
            ("Combustible:", "combustible"),
            ("Otros Gastos:", "otros"),
            ("H13 (Horas Extra):", "h13"),
            ("Tarjetas:", "tarjetas")
        ]
        
        for label_text, key in campos:
            row = ttk.Frame(frame)
            row.pack(fill=tk.X, pady=5)
            
            label = ttk.Label(row, text=label_text, width=20, font=("Arial", 12))
            label.pack(side=tk.LEFT)
            
            entry = ttk.Entry(row, font=("Arial", 12), width=20)
            entry.pack(side=tk.RIGHT, fill=tk.X, expand=True)
            entry.insert(0, "0")
            self.entries[key] = entry
        
        # Botón Calcular
        btn_calc = ttk.Button(self.root, text="CALCULAR TOTAL", 
                             command=self.calcular, style="Accent.TButton")
        btn_calc.pack(pady=15, ipadx=20, ipady=10)
        
        # Resultado
        result_frame = ttk.LabelFrame(self.root, text="Resultado", padding="10")
        result_frame.pack(fill=tk.X, padx=20, pady=10)
        
        self.result_label = tk.Label(result_frame, text="$ 0.00", 
                                    font=("Arial", 24, "bold"), fg="green")
        self.result_label.pack()
        
        # Detalle
        self.detail_text = tk.Text(result_frame, height=6, width=50, 
                                   font=("Courier", 10))
        self.detail_text.pack(pady=5)
        
        # Botón Guardar
        btn_save = ttk.Button(self.root, text="GUARDAR EN EXCEL/CSV", 
                             command=self.guardar)
        btn_save.pack(pady=10, ipadx=20, ipady=8)
        
        # Estilo
        style = ttk.Style()
        style.configure("Accent.TButton", font=("Arial", 12, "bold"))
        
    def calcular(self):
        try:
            # Obtener valores
            valores = {}
            for key, entry in self.entries.items():
                valor = entry.get().strip()
                if valor == "":
                    valores[key] = 0.0
                else:
                    valores[key] = float(valor)
            
            # Calcular total
            total = (valores['recaudado'] - valores['combustible'] - 
                    valores['otros'] - valores['h13'] - valores['tarjetas'])
            
            # Mostrar resultado
            self.result_label.config(text=f"$ {total:,.2f}")
            
            # Mostrar detalle
            detalle = f"""DETALLE DEL CÁLCULO:
================================
Recaudado:     $ {valores['recaudado']:,.2f}
Combustible:   $ {valores['combustible']:,.2f}
Otros Gastos:  $ {valores['otros']:,.2f}
H13:           $ {valores['h13']:,.2f}
Tarjetas:      $ {valores['tarjetas']:,.2f}
================================
TOTAL NETO:    $ {total:,.2f}
================================
Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
            self.detail_text.delete(1.0, tk.END)
            self.detail_text.insert(1.0, detalle)
            
        except ValueError as e:
            messagebox.showerror("Error", "Por favor ingresa solo números válidos")
        except Exception as e:
            messagebox.showerror("Error", f"Error inesperado: {e}")
    
    def guardar(self):
        try:
            # Obtener valores
            valores = {}
            for key, entry in self.entries.items():
                valor = entry.get().strip()
                if valor == "":
                    valores[key] = 0.0
                else:
                    valores[key] = float(valor)
            
            total = (valores['recaudado'] - valores['combustible'] - 
                    valores['otros'] - valores['h13'] - valores['tarjetas'])
            
            # Crear DataFrame
            data = {
                'Recaudado': [valores['recaudado']],
                'Combustible': [valores['combustible']],
                'Otros': [valores['otros']],
                'H13': [valores['h13']],
                'Tarjetas': [valores['tarjetas']],
                'Total': [total],
                'Fecha': [datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
            }
            
            df = pd.DataFrame(data)
            
            # Guardar archivos
            nombre_archivo = f"reporte_facturacion_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Excel
            df.to_excel(f'{nombre_archivo}.xlsx', index=False, engine='openpyxl')
            
            # CSV
            df.to_csv(f'{nombre_archivo}.csv', index=False, encoding='utf-8-sig')
            
            messagebox.showinfo("Éxito", 
                               f"Reporte guardado como:\n{nombre_archivo}.xlsx\n{nombre_archivo}.csv")
            
        except ValueError as e:
            messagebox.showerror("Error", "Por favor ingresa solo números válidos")
        except Exception as e:
            messagebox.showerror("Error", f"Error al guardar: {e}")

def main():
    root = tk.Tk()
    app = FacturacionApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()