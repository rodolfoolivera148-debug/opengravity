from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.textinput import TextInput
from kivy.uix.label import Label
from kivy.metrics import dp
import datetime
import pandas as pd

class FacturacionApp(App):
    def build(self):
        self.layout = BoxLayout(orientation='vertical')
        self.inputs = {}
        self.inputs['recaudado'] = TextInput(text='', font_size=dp(20), size_hint=(1, None), height=dp(40), multiline=False)
        self.layout.add_widget(self.inputs['recaudado'])
        self.inputs['combustible'] = TextInput(text='', font_size=dp(20), size_hint=(1, None), height=dp(40), multiline=False)
        self.layout.add_widget(self.inputs['combustible'])
        self.inputs['otros'] = TextInput(text='', font_size=dp(20), size_hint=(1, None), height=dp(40), multiline=False)
        self.layout.add_widget(self.inputs['otros'])
        self.inputs['h13'] = TextInput(text='', font_size=dp(20), size_hint=(1, None), height=dp(40), multiline=False)
        self.layout.add_widget(self.inputs['h13'])
        self.inputs['tarjetas'] = TextInput(text='', font_size=dp(20), size_hint=(1, None), height=dp(40), multiline=False)
        self.layout.add_widget(self.inputs['tarjetas'])
        self.btn_calc = Button(text='Calcular Reporte', font_size=dp(22), size_hint=(1, None), height=dp(60), background_color=(0.2, 0.6, 0.8, 1))
        self.btn_calc.bind(on_press=self.calcular)
        self.layout.add_widget(self.btn_calc)
        self.resultado = TextInput(text='Resultados...', font_size=dp(20), size_hint=(1, None), height=dp(400), readonly=False)
        self.layout.add_widget(self.resultado)
        self.btn_save = Button(text='Guardar en Excel/CSV', font_size=dp(22), size_hint=(1, None), height=dp(60), background_color=(0.1, 0.7, 0.3, 1))
        self.btn_save.bind(on_press=self.guardar)
        self.layout.add_widget(self.btn_save)
        return self.layout

    def calcular(self, instance):
        try:
            recaudado = float(self.inputs['recaudado'].text)
            combustible = float(self.inputs['combustible'].text)
            otros = float(self.inputs['otros'].text)
            h13 = float(self.inputs['h13'].text)
            tarjetas = float(self.inputs['tarjetas'].text)
            total = recaudado - combustible - otros - h13 - tarjetas
            self.resultado.text = f'Total: {total}'
        except Exception as e:
            self.resultado.text = f'Error: {e}'

    def guardar(self, instance):
        try:
            recaudado = float(self.inputs['recaudado'].text)
            combustible = float(self.inputs['combustible'].text)
            otros = float(self.inputs['otros'].text)
            h13 = float(self.inputs['h13'].text)
            tarjetas = float(self.inputs['tarjetas'].text)
            total = recaudado - combustible - otros - h13 - tarjetas
            data = {'Recaudado': [recaudado], 'Combustible': [combustible], 'Otros': [otros], 'H13': [h13], 'Tarjetas': [tarjetas], 'Total': [total]}
            df = pd.DataFrame(data)
            df.to_excel('reporte.xlsx', index=False)
            df.to_csv('reporte.csv', index=False)
            self.resultado.text = 'Reporte guardado con éxito'
        except Exception as e:
            self.resultado.text = f'Error: {e}'

if __name__ == '__main__':
    FacturacionApp().run()