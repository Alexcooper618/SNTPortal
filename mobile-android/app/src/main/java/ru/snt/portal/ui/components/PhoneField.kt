package ru.snt.portal.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue

@Composable
fun PhoneField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val visualValue = remember(value) {
        val formatted = formatRuPhoneForDisplay(value)
        TextFieldValue(
            text = formatted,
            selection = TextRange(formatted.length),
        )
    }

    OutlinedTextField(
        value = visualValue,
        onValueChange = { next ->
            onValueChange(next.text)
        },
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text("Телефон") },
        placeholder = { Text("+7 (000) 000-00-00") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        trailingIcon = {
            if (value.length > 2) {
                IconButton(onClick = { onValueChange("+7") }) {
                    Icon(Icons.Outlined.Close, contentDescription = "Очистить номер")
                }
            }
        },
    )
}

private fun formatRuPhoneForDisplay(raw: String): String {
    val digits = raw.filter(Char::isDigit)
    if (digits.isEmpty()) return "+7"

    val normalized = when {
        digits.startsWith("7") -> digits.drop(1)
        digits.startsWith("8") -> digits.drop(1)
        else -> digits
    }.take(10)

    val area = normalized.take(3)
    val first = normalized.drop(3).take(3)
    val second = normalized.drop(6).take(2)
    val third = normalized.drop(8).take(2)

    return buildString {
        append("+7")
        if (area.isNotEmpty()) {
            append(" (")
            append(area)
            if (area.length == 3) {
                append(")")
            }
        }
        if (first.isNotEmpty()) {
            append(" ")
            append(first)
        }
        if (second.isNotEmpty()) {
            append("-")
            append(second)
        }
        if (third.isNotEmpty()) {
            append("-")
            append(third)
        }
    }
}
