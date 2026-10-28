package com.facturadorfacil.compartirarchivo

import androidx.core.content.FileProvider

/** Clase propia para no chocar con otros FileProvider declarados por librerías. */
class CompartirFileProvider : FileProvider()
